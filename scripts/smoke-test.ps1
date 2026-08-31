$ErrorActionPreference = "Stop"

$testData = Join-Path $PSScriptRoot "..\.tmp-test-data"
New-Item -ItemType Directory -Force -Path $testData | Out-Null
$env:DATA_DIR = (Resolve-Path $testData).Path
$env:ADMIN_PASSWORD_HASH = (node -e "import('bcryptjs').then(({default:bcrypt}) => bcrypt.hash('TestPassword123!', 12).then(console.log))").Trim()
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_EMAIL = "owner@example.com"
$env:PORT = "3311"
$env:PUBLIC_BASE_URL = "http://127.0.0.1:3311"
$process = Start-Process -FilePath node -ArgumentList "server/index.mjs" -PassThru -WindowStyle Hidden

try {
  Start-Sleep -Seconds 2
  $base = "http://127.0.0.1:3311"
  $health = Invoke-RestMethod "$base/health"
  $customerSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $customer = Invoke-RestMethod "$base/api/account/register" -Method Post -WebSession $customerSession -ContentType "application/json" -Body (@{ name = "Test Client"; email = "test@example.com"; phone = "555-0100"; password = "CustomerPassword123!" } | ConvertTo-Json)
  $ticket = Invoke-RestMethod "$base/api/tickets" -Method Post -WebSession $customerSession -ContentType "application/json" -Body (@{ name = "Test Client"; email = "test@example.com"; phone = "555-0100"; assistance = "Please move my files to a new computer." } | ConvertTo-Json)
  $contact = Invoke-RestMethod "$base/api/contact" -Method Post -ContentType "application/json" -Body (@{ name = "Contact Client"; email = "contact@example.com"; phone = "555-0102"; message = "I have a question about your repair hours." } | ConvertTo-Json)
  $customerOrders = Invoke-RestMethod "$base/api/account/work-orders" -WebSession $customerSession

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod "$base/api/admin/login" -Method Post -WebSession $session -ContentType "application/json" -Body (@{ username = "admin"; password = "TestPassword123!" } | ConvertTo-Json) | Out-Null
  $csrf = Invoke-RestMethod "$base/api/admin/session" -WebSession $session
  $headers = @{ "X-CSRF-Token" = $csrf.csrfToken }
  $contacts = Invoke-RestMethod "$base/api/admin/contacts?search=contact@example.com" -WebSession $session
  $termsBody = "Published repair terms: I authorize inspection and listed services, understand data loss, hardware failure, pre-existing damage, backup limits, accessories, pricing, additional-work approval, payment, storage, liability limits, non-waivable rights, and electronic records."
  Invoke-RestMethod "$base/api/admin/terms" -Method Post -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ body = $termsBody } | ConvertTo-Json) | Out-Null

  $invited = Invoke-RestMethod "$base/api/admin/customers" -Method Post -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ name = "Invited Client"; email = "invited@example.com"; phone = "555-0101" } | ConvertTo-Json)
  if (-not $invited.customer.pendingPassword) { throw "Admin-created customer was not marked pending password." }
  $invite = Invoke-RestMethod "$base/api/admin/customers/$($invited.customer.id)/invite" -Method Post -WebSession $session -Headers $headers
  $invitedSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $inviteCheck = Invoke-RestMethod "$base/api/account/setup?token=$([uri]::EscapeDataString(([uri]$invite.setupUrl).Query.Substring(7)))"
  Invoke-RestMethod "$base/api/account/setup-password" -Method Post -WebSession $invitedSession -ContentType "application/json" -Body (@{ token = ([uri]$invite.setupUrl).Query.Substring(7); password = "InvitedPassword123!" } | ConvertTo-Json) | Out-Null

  $adminWorkOrder = Invoke-RestMethod "$base/api/admin/customers/$($invited.customer.id)/work-orders" -Method Post -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ notes = "The client reports intermittent shutdowns."; repairNotes = "Inspect power delivery and thermal readings."; deviceCondition = "Desktop received powered off with visible dust around the intake."; accessories = "Power cable and wireless keyboard."; services = @(@{ name = "PC cleaning"; priceCents = 6900 }, @{ name = "Repair work"; priceCents = 12900 }, @{ name = "Custom diagnostic"; priceCents = 2500 }) } | ConvertTo-Json -Depth 5)
  $orderId = [uri]::EscapeDataString($adminWorkOrder.workOrder.id)
  $unsignedBlocked = $false
  try { Invoke-RestMethod "$base/api/admin/work-orders/$orderId" -Method Patch -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ status = "in-progress" } | ConvertTo-Json) | Out-Null } catch { if ($_.Exception.Response.StatusCode.value__ -ne 409) { throw }; $unsignedBlocked = $true }
  $approval = Invoke-RestMethod "$base/api/admin/work-orders/$orderId/consent" -Method Post -WebSession $session -Headers $headers
  $consentToken = ([uri]$approval.consentUrl).Query.Substring(7)
  $review = Invoke-RestMethod "$base/api/account/consent?token=$([uri]::EscapeDataString($consentToken))"
  $signed = Invoke-RestMethod "$base/api/account/consent" -Method Post -ContentType "application/json" -Body (@{ token = $consentToken; signatureName = "Invited Client"; termsAccepted = $true; electronicRecordsAccepted = $true; accessoriesAcknowledged = $true; accessoriesLeft = $true; backupRequested = $false } | ConvertTo-Json)
  $started = Invoke-RestMethod "$base/api/admin/work-orders/$orderId" -Method Patch -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ status = "in-progress" } | ConvertTo-Json)
  $customerOrdersAfter = Invoke-RestMethod "$base/api/account/work-orders" -WebSession $invitedSession
  $edited = Invoke-RestMethod "$base/api/admin/work-orders/$orderId" -Method Patch -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ repairNotes = "Updated private repair notes." } | ConvertTo-Json)
  $search = Invoke-RestMethod "$base/api/admin/work-orders?search=$([uri]::EscapeDataString($adminWorkOrder.workOrder.id))" -WebSession $session
  $staff = Invoke-RestMethod "$base/api/admin/staff" -Method Post -WebSession $session -Headers $headers -ContentType "application/json" -Body (@{ name = "Test Employee"; username = "test-employee"; email = "employee@example.com"; password = "EmployeePassword123!"; role = "admin" } | ConvertTo-Json)

  if (("$health").Trim() -ne "ok") { throw "Health check failed: $health" }
  if ($customerOrders.workOrders.Count -ne 1) { throw "Customer work-order list failed." }
  if ($contact.contact.status -ne "contact-needed" -or $contacts.contacts.Count -ne 1) { throw "Contact request separation failed." }
  if ($ticket.ticket.id -notmatch '^#\d{2}/\d{2}/\d{2}-\d{4}$') { throw "Work-order number format failed." }
  if (-not $inviteCheck.customer.email -or $review.consent.workOrder.services.Count -ne 3) { throw "Invitation or priced service review failed." }
  if ($adminWorkOrder.workOrder.totalCents -ne 22300) { throw "Service total failed: $($adminWorkOrder.workOrder.totalCents)" }
  if (-not $unsignedBlocked -or $signed.workOrder.status -ne "ready-to-start" -or $started.workOrder.status -ne "in-progress") { throw "Approval status enforcement failed." }
  if ($customerOrdersAfter.workOrders[0].repairNotes) { throw "Repair notes leaked to customer response." }
  if ($edited.workOrder.repairNotes -ne "Updated private repair notes." -or $edited.workOrder.status -ne "in-progress") { throw "Private repair-note editing changed the order incorrectly." }
  if ($search.workOrders.Count -ne 1 -or $staff.staff.username -ne "test-employee") { throw "Admin search or staff access failed." }
  Write-Output "Smoke test passed: invitations, password setup, priced services, terms, approval, status enforcement, private notes, customer Orders data, search, and staff access."
} finally {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
