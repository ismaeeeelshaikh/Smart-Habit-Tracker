from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timedelta, timezone
import secrets
import hashlib

from app.db.database import get_db
from app.db.models import User, RefreshToken
from app.schemas.user import UserCreate, UserResponse
from app.schemas.auth import Token, LoginRequest
from app.core.security import get_password_hash, verify_password, create_access_token
from app.core.config import settings
from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from sqlalchemy import update

router = APIRouter()

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def signup(
    user_in: UserCreate, 
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email.ilike(user_in.email)))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user = User(
        email=user_in.email.lower(),
        password_hash=get_password_hash(user_in.password),
        timezone=user_in.timezone
    )
    db.add(user)
    await db.flush()
    
    access_token = create_access_token(subject=str(user.id))
    
    raw_refresh_token = secrets.token_urlsafe(32)
    refresh_hash = hash_token(raw_refresh_token)
    
    rt = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else ""
    )
    db.add(rt)
    await db.commit()
    
    response.set_cookie(
        key="refresh_token", 
        value=raw_refresh_token, 
        httponly=True, 
        secure=True, 
        samesite="lax", # Allow frontend local dev
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    login_data: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email.ilike(login_data.email)))
    user = result.scalars().first()
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(subject=str(user.id))
    
    raw_refresh_token = secrets.token_urlsafe(32)
    refresh_hash = hash_token(raw_refresh_token)
    
    rt = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else ""
    )
    db.add(rt)
    await db.commit()
    
    response.set_cookie(
        key="refresh_token", 
        value=raw_refresh_token, 
        httponly=True, 
        secure=True, 
        samesite="lax", # Allow frontend local dev
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")
        
    token_hash = hash_token(token)
    
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    rt = result.scalars().first()
    
    if not rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        
    # Check if expired (assuming Postgres returns UTC)
    expires_at = rt.expires_at if rt.expires_at.tzinfo else rt.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
        
    # Reuse detection
    if rt.revoked_at is not None or rt.replaced_by_token_id is not None:
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == rt.user_id)
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await db.commit()
        response.delete_cookie("refresh_token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token reuse detected. All sessions revoked.")
        
    rt.revoked_at = datetime.now(timezone.utc)
    
    raw_new_refresh = secrets.token_urlsafe(32)
    new_refresh_hash = hash_token(raw_new_refresh)
    
    new_rt = RefreshToken(
        user_id=rt.user_id,
        token_hash=new_refresh_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else ""
    )
    db.add(new_rt)
    await db.flush()
    
    rt.replaced_by_token_id = new_rt.id
    await db.commit()
    
    access_token = create_access_token(subject=str(rt.user_id))
    
    response.set_cookie(
        key="refresh_token", 
        value=raw_new_refresh, 
        httponly=True, 
        secure=True, 
        samesite="lax", # Allow frontend local dev
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    token = request.cookies.get("refresh_token")
    if token:
        token_hash = hash_token(token)
        result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
        rt = result.scalars().first()
        if rt and rt.revoked_at is None:
            rt.revoked_at = datetime.now(timezone.utc)
            await db.commit()
            
    response.delete_cookie("refresh_token")
    return {"detail": "Logged out successfully"}
