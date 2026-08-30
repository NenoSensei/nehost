$ErrorActionPreference = "Stop"

$testData = Join-Path $PSScriptRoot "..\.tmp-test-data"
New-Item -ItemType Directory -Force -Path $testData | Out-Null
$env:DATA_DIR = (Resolve-Path $testData).Path
$env:ADMIN_PASSWORD_HASH = (node -e "import('bcryptjs').then(({default:bcrypt}) => bcrypt.hash('TestPassword123!', 12).then(console.log))").Trim()
$env:ADMIN_USERNAME = "admin"
$env:PORT = "3311"
$process = Start-Process -FilePath node -ArgumentList "server/index.mjs" -PassThru -WindowStyle Hidden

try {
  Start-Sleep -Seconds 2
  $health = Invoke-RestMethod "http://127.0.0.1:3311/health"
  $customerSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $customer = Invoke-RestMethod "http://127.0.0.1:3311/api/account/register" -Method Post -WebSession $customerSession -ContentType "application/json" -Body (@{
    name = "Test Client"
    email = "test@example.com"
    phone = "555-0100"
    password = "CustomerPassword123!"
  } | ConvertTo-Json)
  $ticket = Invoke-RestMethod "http://127.0.0.1:3311/api/tickets" -Method Post -WebSession $customerSession -ContentType "application/json" -Body (@{
    name = "Test Client"
    email = "test@example.com"
    phone = "555-0100"
    assistance = "Please move my files to a new computer."
  } | ConvertTo-Json)
  $customerOrders = Invoke-RestMethod "http://127.0.0.1:3311/api/account/work-orders" -WebSession $customerSession
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod "http://127.0.0.1:3311/api/admin/login" -Method Post -WebSession $session -ContentType "application/json" -Body (@{
    username = "admin"
    password = "TestPassword123!"
  } | ConvertTo-Json) | Out-Null
  $csrf = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/session" -WebSession $session
  $tickets = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/work-orders" -WebSession $session
  $search = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/work-orders?search=test@example.com" -WebSession $session
  $updated = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/work-orders/$([uri]::EscapeDataString($ticket.ticket.id))" -Method Patch -WebSession $session -Headers @{
    "X-CSRF-Token" = $csrf.csrfToken
  } -ContentType "application/json" -Body (@{ status = "in-progress" } | ConvertTo-Json)
  $staff = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/staff" -Method Post -WebSession $session -Headers @{ "X-CSRF-Token" = $csrf.csrfToken } -ContentType "application/json" -Body (@{
    name = "Test Employee"
    username = "test-employee"
    email = "employee@example.com"
    password = "EmployeePassword123!"
    role = "admin"
  } | ConvertTo-Json)

  if (("$health").Trim() -ne "ok") { throw "Health check failed: $health" }
  if ($tickets.workOrders.Count -lt 1) { throw "Work order was not returned to admin." }
  if ($customerOrders.workOrders.Count -ne 1) { throw "Customer work-order list failed." }
  if ($ticket.ticket.id -notmatch '^#\d{2}/\d{2}/\d{2}-\d{4}$') { throw "Work-order number format failed: $($ticket.ticket.id)" }
  if ($search.workOrders.Count -ne 1) { throw "Work-order search failed." }
  if ($updated.ticket.status -ne "in-progress") { throw "Ticket status did not update." }
  if ($staff.staff.username -ne "test-employee") { throw "Staff account creation failed." }
  Write-Output "Smoke test passed: health, account creation, formatted work order, customer history, admin login, search, staff access, and status update."
} finally {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
