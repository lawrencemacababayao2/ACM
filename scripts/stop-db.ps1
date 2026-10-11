# Stops the project-local MariaDB instance.
Get-Process -Name mysqld -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "MariaDB stopped." -ForegroundColor Cyan