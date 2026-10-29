using System;
using DotNetEnv;

// 1. Load variables from 2-csharp-gateway-api/.env
Env.Load();

string csharpPort = Environment.GetEnvironmentVariable("CSHARP_PORT") ?? "5000";
string allowedOrigin = Environment.GetEnvironmentVariable("ALLOWED_REACT_ORIGIN") ?? "http://localhost:5173";

var builder = WebApplication.CreateBuilder(args);

// 2. Register Controllers and HttpClient into the Dependency Injection container
builder.Services.AddControllers();
builder.Services.AddHttpClient();

// 3. Give our React app (Port 5173) permission to call this C# server (Port 5000)
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactCorsPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigin)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// 4. Turn on CORS and Controller routing, then boot the server!
app.UseCors("ReactCorsPolicy");
app.MapControllers();

app.Run($"http://localhost:{csharpPort}");