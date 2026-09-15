
Add-Type -AssemblyName System.Drawing
 = [System.Drawing.Image]::FromFile('C:\Users\DRUG-330\.gemini\antigravity\brain\854a8ff4-f0bf-4b2d-a02e-534c59e3cf74\.user_uploaded\media_1789380542605.jpg')
 = New-Object System.Drawing.Rectangle([int](.Width * 0.42), [int](.Height * 0.48), [int](.Width * 0.23), [int](.Height * 0.12))
 = New-Object System.Drawing.Bitmap(.Width, .Height)
 = [System.Drawing.Graphics]::FromImage()
.DrawImage(, (New-Object System.Drawing.Rectangle(0, 0, .Width, .Height)), , [System.Drawing.GraphicsUnit]::Pixel)
.Dispose()
.Dispose()
.Save('C:\Users\DRUG-330\.gemini\antigravity\brain\854a8ff4-f0bf-4b2d-a02e-534c59e3cf74\scratch\cert_crop.png', [System.Drawing.Imaging.ImageFormat]::Png)
.Dispose()
Write-Host 'Done'
