$ErrorActionPreference = "Stop"
Push-Location (Join-Path $PSScriptRoot "..")
try {
    npm run check
    if ($LASTEXITCODE -ne 0) { throw "Validation failed." }
    npm audit --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw "Full dependency audit failed." }
    npm audit --omit=dev --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw "Production dependency audit failed." }
}
finally {
    Pop-Location
}
