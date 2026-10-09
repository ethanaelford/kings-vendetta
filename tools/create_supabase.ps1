# Creates the kings-vendetta Supabase project using the password stored in .env.local
$line = Select-String -Path "$PSScriptRoot\..\.env.local" -Pattern 'SUPABASE_DB_PASSWORD=' | Select-Object -First 1
$pw = $line.Line.Split('=',2)[1]
npx -y supabase projects create kings-vendetta --org-id lnygwgohvhveunuihipw --region us-east-1 --db-password $pw
