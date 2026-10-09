# Braise & Co — dernier passage des tâches planifiées du PC, pour le mail « Santé des automatisations »
# Tâche « Braise - Battement » (ouverture de session et 21h30). Copie de sante/battement.ps1 dans ~/.braise.
$ErrorActionPreference = 'Stop'
$SB  = 'https://ugyrrnqpapeagpuocwob.supabase.co'
$KEY = (Get-Content (Join-Path $PSScriptRoot 'sb-service-role.key') -Raw).Trim()
$H = @{ apikey = $KEY; Authorization = "Bearer $KEY"; Prefer = 'resolution=merge-duplicates' }

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
for ($i = 0; $i -lt 20; $i++) {
  try { Invoke-WebRequest -Uri "$SB/rest/v1/" -Headers $H -UseBasicParsing -TimeoutSec 10 | Out-Null; break }
  catch { if ($_.Exception.Response) { break }; Start-Sleep -Seconds 15 }
}
$maintenant = (Get-Date).ToUniversalTime().ToString('o')
$lignes = @(@{ nom = 'PC'; dernier_passage = $maintenant; resultat = 0; maj_at = $maintenant })
foreach ($t in Get-ScheduledTask | Where-Object { $_.TaskName -like 'Braise - *' -or $_.TaskName -eq 'Réception BL' }) {
  if ($t.TaskName -eq 'Braise - Battement') { continue }
  $i = $t | Get-ScheduledTaskInfo
  $lignes += @{ nom = $t.TaskName -replace '^Braise - ', ''; dernier_passage = $i.LastRunTime.ToUniversalTime().ToString('o')
                resultat = [long]$i.LastTaskResult; maj_at = $maintenant }
}
$body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json @($lignes)))
Invoke-RestMethod -Method Post -Headers $H -ContentType 'application/json' -Uri "$SB/rest/v1/sante_battements" -Body $body
