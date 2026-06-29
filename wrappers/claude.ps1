# enterprise-wrapper/wrappers/claude.ps1
# PowerShell wrapper for Claude CLI with enterprise constraints
#
# 无需管理员权限，用户级部署
# 安装位置: %USERPROFILE%\bin\claude.ps1

param(
    [Parameter(ValueFromRemainingArguments)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Continue"

# ============================================
# 配置路径（用户级）
# ============================================
$EnterpriseRules = $env:CLAUDE_ENTERPRISE_RULES
if (-not $EnterpriseRules) {
    $EnterpriseRules = Join-Path $env:APPDATA "ClaudeEnterprise\baseline.md"
}

$EnterpriseConfig = Join-Path $env:APPDATA "ClaudeEnterprise\config.ps1"

# 加载用户自定义配置（可选）
if (Test-Path $EnterpriseConfig) {
    . $EnterpriseConfig
}

# ============================================
# 查找原 Claude binary
# ============================================
function Find-OriginalClaude {
    $selfDir = Split-Path $PSCommandPath -Parent

    $locations = @(
        Join-Path $env:USERPROFILE "bin\claude-original.exe"    # 我们备份的位置
        Join-Path $env:LOCALAPPDATA "Claude\claude.exe"         # Claude 官方用户级安装
        Join-Path $env:USERPROFILE ".claude\bin\claude.exe"     # Claude 用户级安装
        Join-Path $env:ProgramFiles "Claude\claude.exe"         # 系统级安装（可能不存在）
    )

    foreach ($loc in $locations) {
        if (Test-Path $loc -PathType Leaf) {
            $locDir = Split-Path $loc -Parent
            if ($locDir -ne $selfDir) {
                return $loc
            }
        }
    }

    # 从 PATH 查找（排除 wrapper 自身）
    $pathClaude = Get-Command claude.exe -ErrorAction SilentlyContinue
    if ($pathClaude) {
        $pathDir = Split-Path $pathClaude.Source -Parent
        if ($pathDir -ne $selfDir) {
            return $pathClaude.Source
        }
    }

    # 最后尝试 claude 命令（可能已在 PATH 中）
    $pathClaude = Get-Command claude -ErrorAction SilentlyContinue
    if ($pathClaude -and $pathClaude.Source -ne $PSCommandPath) {
        return $pathClaude.Source
    }

    throw "Cannot find original Claude binary. Please ensure Claude CLI is installed."
}

# ============================================
# 支持绕过选项
# ============================================
if ($Arguments.Count > 0 -and $Arguments[0] -eq "--no-enterprise") {
    $Arguments = $Arguments | Select-Object -Skip 1
    $ClaudeOriginal = Find-OriginalClaude
    & $ClaudeOriginal $Arguments
    exit $LASTEXITCODE
}

# ============================================
# 检查规则文件
# ============================================
if (-not (Test-Path $EnterpriseRules)) {
    Write-Warning "Enterprise rules file not found: $EnterpriseRules"
    Write-Warning "Running without enterprise constraints..."
    $ClaudeOriginal = Find-OriginalClaude
    & $ClaudeOriginal $Arguments
    exit $LASTEXITCODE
}

# ============================================
# 执行 Claude with enterprise rules
# ============================================
$ClaudeOriginal = Find-OriginalClaude
& $ClaudeOriginal --append-system-prompt-file $EnterpriseRules $Arguments
exit $LASTEXITCODE