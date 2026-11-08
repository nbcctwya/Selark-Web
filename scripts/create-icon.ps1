$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../build'))
[IO.Directory]::CreateDirectory($iconDirectory) | Out-Null
$bitmap = New-Object System.Drawing.Bitmap(256, 256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$shape = New-Object Drawing.Drawing2D.GraphicsPath
$shape.AddArc(0, 0, 80, 80, 180, 90)
$shape.AddArc(175, 0, 80, 80, 270, 90)
$shape.AddArc(175, 175, 80, 80, 0, 90)
$shape.AddArc(0, 175, 80, 80, 90, 90)
$shape.CloseFigure()
$brush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(23, 124, 98))
$graphics.FillPath($brush, $shape)
$pen = New-Object Drawing.Pen([Drawing.Color]::White, 17)
$pen.StartCap = [Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
$points = [Drawing.PointF[]]@([Drawing.PointF]::new(171, 71), [Drawing.PointF]::new(85, 107), [Drawing.PointF]::new(171, 149), [Drawing.PointF]::new(85, 185))
$graphics.DrawLines($pen, $points)
$graphics.DrawLine($pen, 85, 107, 85, 71)
$graphics.DrawLine($pen, 171, 149, 171, 185)
$png = New-Object IO.MemoryStream
$bitmap.Save($png, [Drawing.Imaging.ImageFormat]::Png)
$bytes = $png.ToArray()
$stream = [IO.File]::Create((Join-Path $iconDirectory 'icon.ico'))
$writer = New-Object IO.BinaryWriter($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$bytes.Length); $writer.Write([uint32]22)
$writer.Write($bytes)
$writer.Dispose(); $png.Dispose(); $pen.Dispose(); $brush.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
Write-Output 'Generated build/icon.ico (256px PNG in ICO).'
