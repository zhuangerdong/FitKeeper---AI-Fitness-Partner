from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .routes import auth, chat
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# CORS configuration
origins = [
    "http://localhost:5173",  # Vite default port
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

@app.get("/api/health")
async def health_check():
    return {
        "success": True,
        "message": "ok"
    }

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "success": False,
            "error": "API not found"
        }
    )

@app.exception_handler(500)
async def internal_server_error_handler(request: Request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Server internal error"
        }
    )
