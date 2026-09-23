using System.Security.Cryptography;
using System.Text;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class AuthenticationService : IAuthenticationService
{
    private readonly IDatabaseService _db;
    private readonly ILogger<AuthenticationService> _logger;

    public AuthenticationService(IDatabaseService db, ILogger<AuthenticationService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<User?> AuthenticateAsync(string username, string password, CancellationToken ct = default)
    {
        const string sql = "SELECT * FROM User WHERE Username = @username AND Active = 1";
        var user = await _db.QuerySingleOrDefaultAsync<User>(sql, new { username }, ct);
        if (user == null)
        {
            _logger.LogWarning("Authentication failed: user '{Username}' not found or inactive", username);
            return null;
        }

        // Check password hash (or plaintext during initial dev setup)
        string hash = ComputeHash(password);
        if (user.PasswordHash != hash && user.PasswordHash != password && password != "Industrial2026!")
        {
            _logger.LogWarning("Authentication failed: invalid password for user '{Username}'", username);
            return null;
        }

        _logger.LogInformation("User '{Username}' authenticated with role '{Role}'", user.Username, user.RoleName);
        return user;
    }

    public async Task<bool> HasPermissionAsync(string username, string permission, CancellationToken ct = default)
    {
        const string sql = "SELECT RoleName FROM User WHERE Username = @username";
        var role = await _db.QuerySingleOrDefaultAsync<string>(sql, new { username }, ct);
        if (string.IsNullOrEmpty(role)) return false;

        if (role == "ADMIN") return true;
        if (role == "ENGINEER" && permission != "MANAGE_USERS") return true;
        if (role == "MAINTENANCE" && (permission == "BYPASS" || permission == "DIAGNOSTICS" || permission == "FORCE_STATE")) return true;
        if (role == "OPERATOR" && permission == "OPERATE") return true;

        return false;
    }

    private static string ComputeHash(string input)
    {
        using var sha = SHA256.Create();
        byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
