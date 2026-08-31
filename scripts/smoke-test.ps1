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
  $customerSearch = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/customers?search=test@example.com" -WebSession $session
  $customerDetails = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/customers/$($customer.customer.id)" -WebSession $session
  $adminWorkOrder = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/customers/$($customer.customer.id)/work-orders" -Method Post -WebSession $session -Headers @{
    "X-CSRF-Token" = $csrf.csrfToken
  } -ContentType "application/json" -Body (@{
    notes = "The client reports intermittent shutdowns."
    repairNotes = "Inspect power delivery and thermal readings."
    deviceCondition = "Desktop received powered off with visible dust around the intake."
    accessories = "Power cable and wireless keyboard."
    services = @("PC cleaning", "Repair work", "Custom diagnostic")
  } | ConvertTo-Json)
  $adminOrderSearch = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/work-orders?search=$([uri]::EscapeDataString($adminWorkOrder.workOrder.id))" -WebSession $session
  $customerOrdersAfterAdminCreate = Invoke-RestMethod "http://127.0.0.1:3311/api/account/work-orders" -WebSession $customerSession
  $editedWorkOrder = Invoke-RestMethod "http://127.0.0.1:3311/api/admin/work-orders/$([uri]::EscapeDataString($adminWorkOrder.workOrder.id))" -Method Patch -WebSession $session -Headers @{
    "X-CSRF-Token" = $csrf.csrfToken
  } -ContentType "application/json" -Body (@{
    notes = "Updated issue notes."
    repairNotes = "Updated private repair notes."
    deviceCondition = "Updated condition after bench inspection."
    accessories = "Power cable only."
    services = @("PC cleaning")
    status = "in-progress"
  } | ConvertTo-Json)
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
  if ($customerSearch.customers.Count -ne 1 -or $customerDetails.customer.email -ne "test@example.com") { throw "Customer search or detail lookup failed." }
  if ($adminWorkOrder.workOrder.id -notmatch '^#\d{2}/\d{2}/\d{2}-\d{4}$') { throw "Admin work-order number format failed: $($adminWorkOrder.workOrder.id)" }
  if ($adminWorkOrder.workOrder.repairNotes -ne "Inspect power delivery and thermal readings." -or $adminWorkOrder.workOrder.services.Count -ne 3) { throw "Admin work-order details were not saved." }
  if ($adminOrderSearch.workOrders.Count -ne 1) { throw "Admin work-order number search failed." }
  $customerAdminOrder = @($customerOrdersAfterAdminCreate.workOrders | Where-Object { $_.id -eq $adminWorkOrder.workOrder.id })[0]
  if (-not $customerAdminOrder -or $customerAdminOrder.notes -ne "The client reports intermittent shutdowns." -or $customerAdminOrder.deviceCondition -notmatch "visible dust" -or $customerAdminOrder.repairNotes) { throw "Customer work-order visibility failed." }
  if ($editedWorkOrder.workOrder.notes -ne "Updated issue notes." -or $editedWorkOrder.workOrder.repairNotes -ne "Updated private repair notes." -or $editedWorkOrder.workOrder.services.Count -ne 1) { throw "Work-order editing failed." }
  if ($updated.ticket.status -ne "in-progress") { throw "Ticket status did not update." }
  if ($staff.staff.username -ne "test-employee") { throw "Staff account creation failed." }
  Write-Output "Smoke test passed: account creation, customer search, admin work-order creation/editing, private notes, customer visibility, formatted IDs, search, staff access, and status updates."
} finally {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
