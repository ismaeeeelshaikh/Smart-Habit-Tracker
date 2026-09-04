import secrets
import uuid

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.config import settings
from app.db.database import get_db
from app.db.models import User

# HTTPBearer rather than OAuth2PasswordBearer: /auth/login takes JSON, not the
# form-encoded body an OAuth2 password flow implies, so the bearer scheme is the
# honest description and makes Swagger's Authorize dialog actually work.
# auto_error=False so a missing header surfaces as 401, not FastAPI's default 403.
bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise CREDENTIALS_EXCEPTION

    try:
        payload = jwt.decode(
            credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as err:
        raise CREDENTIALS_EXCEPTION from err

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise CREDENTIALS_EXCEPTION
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError as err:
        raise CREDENTIALS_EXCEPTION from err

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if user is None:
        raise CREDENTIALS_EXCEPTION
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return user


async def require_internal_key(x_internal_key: str | None = Header(None)) -> None:
    """Gate for /internal/* — the telegram and scheduler containers.

    Those processes act for a user identified by Telegram chat id rather than by
    a JWT, so they authenticate as *services* with a shared secret. Compared in
    constant time, since a timing side channel on a static secret is exactly the
    kind of thing that is cheap to avoid and awkward to discover later.
    """
    if not x_internal_key or not secrets.compare_digest(
        x_internal_key, settings.INTERNAL_API_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal key"
        )
