import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.database import get_db
from app.db.models import RefreshToken, User
from app.schemas.auth import LoginRequest, PasswordChangeRequest, Token
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()

REFRESH_COOKIE_NAME = "refresh_token"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=raw_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )


async def _issue_refresh_token(
    db: AsyncSession, user_id, request: Request
) -> tuple[str, RefreshToken]:
    """Create and persist a refresh token row, returning the raw token to cookie."""
    raw_token = secrets.token_urlsafe(32)
    rt = RefreshToken(
        user_id=user_id,
        token_hash=hash_token(raw_token),
        expires_at=datetime.now(UTC)
        + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        user_agent=request.headers.get("user-agent", "")[:255],
        ip_address=request.client.host if request.client else "",
    )
    db.add(rt)
    return raw_token, rt


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def signup(
    user_in: UserCreate,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email.ilike(user_in.email)))
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    user = User(
        email=user_in.email.lower(),
        password_hash=get_password_hash(user_in.password),
        timezone=user_in.timezone,
    )
    db.add(user)
    await db.flush()

    access_token = create_access_token(subject=str(user.id))
    raw_refresh_token, _ = await _issue_refresh_token(db, user.id, request)
    await db.commit()

    _set_refresh_cookie(response, raw_refresh_token)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    login_data: LoginRequest,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db),
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
    raw_refresh_token, _ = await _issue_refresh_token(db, user.id, request)
    await db.commit()

    _set_refresh_cookie(response, raw_refresh_token)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing"
        )

    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(token))
    )
    rt = result.scalars().first()

    if not rt:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    expires_at = (
        rt.expires_at
        if rt.expires_at.tzinfo
        else rt.expires_at.replace(tzinfo=UTC)
    )
    if expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired"
        )

    # Reuse detection: a token presented after it was rotated/revoked means the
    # cookie leaked — burn every session for that user.
    if rt.revoked_at is not None or rt.replaced_by_token_id is not None:
        await db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == rt.user_id, RefreshToken.revoked_at.is_(None)
            )
            .values(revoked_at=datetime.now(UTC))
        )
        await db.commit()
        response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions revoked.",
        )

    rt.revoked_at = datetime.now(UTC)
    raw_new_refresh, new_rt = await _issue_refresh_token(db, rt.user_id, request)
    await db.flush()
    rt.replaced_by_token_id = new_rt.id
    await db.commit()

    access_token = create_access_token(subject=str(rt.user_id))
    _set_refresh_cookie(response, raw_new_refresh)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if token:
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(token))
        )
        rt = result.scalars().first()
        if rt and rt.revoked_at is None:
            rt.revoked_at = datetime.now(UTC)
            await db.commit()

    response.delete_cookie(REFRESH_COOKIE_NAME, path="/")
    return {"detail": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: User = Depends(get_current_user)):
    """Identity + onboarding/telegram state — drives frontend gating."""
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    current_user.password_hash = get_password_hash(payload.new_password)

    # Changing a password invalidates every other session.
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == current_user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    raw_refresh_token, _ = await _issue_refresh_token(db, current_user.id, request)
    await db.commit()

    _set_refresh_cookie(response, raw_refresh_token)
    return None
