from fastapi import FastAPI

app = FastAPI(title="Personal Time Intelligence API")

@app.get("/health")
async def health_check():
    return {"status": "ok"}
