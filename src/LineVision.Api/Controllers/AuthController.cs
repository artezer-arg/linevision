using LineVision.Core.Domain.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthenticationService _auth;

    public AuthController(IAuthenticationService auth)
    {
        _auth = auth;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var user = await _auth.AuthenticateAsync(req.Username, req.Password);
        if (user == null)
        {
            return Unauthorized(new { Message = "Credenciales inválidas" });
        }

        return Ok(new
        {
            Username = user.Username,
            DisplayName = user.DisplayName,
            Role = user.RoleName,
            BadgeNumber = user.BadgeNumber
        });
    }
}

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}
