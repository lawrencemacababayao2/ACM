# Starts the project-local MariaDB instance used by AgriConnect Medina.
# Keeps the console window open; close the window (or run stop-db.ps1) to stop it.
$mysqld = "C:\database\mysql\bin\mysqld.exe"
$dataDir = "C:\xampp\acm-mysql-data"
$port = 3307

if (Get-Process -Name mysqld -ErrorAction SilentlyContinue) {
  Write-Host "mysqld is already running." -ForegroundColor Yellow
  exit 0
}

Write-Host "Starting MariaDB on port $port with datadir $dataDir ..." -ForegroundColor Cyan
& $mysqld --datadir="$dataDir" --port=$port