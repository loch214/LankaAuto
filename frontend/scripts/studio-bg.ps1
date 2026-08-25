param(
  [Parameter(Mandatory=$true)][string]$Path
)

Add-Type -AssemblyName System.Drawing

$sw = [System.Diagnostics.Stopwatch]::StartNew()

$bmp = New-Object System.Drawing.Bitmap($Path)
$w = $bmp.Width
$h = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$bmpData = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$stride = $bmpData.Stride
$total = $stride * $h
$bytes = New-Object byte[] $total
[System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $bytes, 0, $total)

$threshold = 200
$n = $w * $h
$isLight = New-Object bool[] $n
for ($y = 0; $y -lt $h; $y++) {
  $rowOff = $y * $stride
  $rowBase = $y * $w
  for ($x = 0; $x -lt $w; $x++) {
    $off = $rowOff + $x * 3
    $b = $bytes[$off]; $g = $bytes[$off + 1]; $r = $bytes[$off + 2]
    if ($r -ge $threshold -and $g -ge $threshold -and $b -ge $threshold) {
      $isLight[$rowBase + $x] = $true
    }
  }
}
Write-Output "isLight scan: $($sw.ElapsedMilliseconds)ms"

# BFS flood fill from border over $isLight, result -> $isBg
$isBg = New-Object bool[] $n
$visited = New-Object bool[] $n
$queue = New-Object System.Collections.Generic.Queue[int]

for ($x = 0; $x -lt $w; $x++) {
  foreach ($y in @(0, ($h - 1))) {
    $i = $y * $w + $x
    if (-not $visited[$i] -and $isLight[$i]) { $visited[$i] = $true; $isBg[$i] = $true; $queue.Enqueue($i) }
  }
}
for ($y = 0; $y -lt $h; $y++) {
  foreach ($x in @(0, ($w - 1))) {
    $i = $y * $w + $x
    if (-not $visited[$i] -and $isLight[$i]) { $visited[$i] = $true; $isBg[$i] = $true; $queue.Enqueue($i) }
  }
}

while ($queue.Count -gt 0) {
  $i = $queue.Dequeue()
  $cy = [int]([Math]::Floor($i / $w))
  $cx = $i - $cy * $w
  if ($cx -gt 0) {
    $ni = $i - 1
    if (-not $visited[$ni]) { $visited[$ni] = $true; if ($isLight[$ni]) { $isBg[$ni] = $true; $queue.Enqueue($ni) } }
  }
  if ($cx -lt $w - 1) {
    $ni = $i + 1
    if (-not $visited[$ni]) { $visited[$ni] = $true; if ($isLight[$ni]) { $isBg[$ni] = $true; $queue.Enqueue($ni) } }
  }
  if ($cy -gt 0) {
    $ni = $i - $w
    if (-not $visited[$ni]) { $visited[$ni] = $true; if ($isLight[$ni]) { $isBg[$ni] = $true; $queue.Enqueue($ni) } }
  }
  if ($cy -lt $h - 1) {
    $ni = $i + $w
    if (-not $visited[$ni]) { $visited[$ni] = $true; if ($isLight[$ni]) { $isBg[$ni] = $true; $queue.Enqueue($ni) } }
  }
}
Write-Output "flood fill: $($sw.ElapsedMilliseconds)ms"

# --- Enclosed holes: light regions not touching the border (e.g. a bearing's
# center hole showing the same white backdrop through the part) also read as
# "background", not object detail. Label each remaining light component; if
# it's big enough to be a real hole (not just a small specular highlight on
# the metal), fold it into $isBg too. ---
$holeThreshold = 1500
$minFillRatio = 0.55  # component area / its bounding-box area - filters out
                       # thin curved specular streaks, keeps round/blobby holes
$labelVisited = New-Object bool[] $n
for ($start = 0; $start -lt $n; $start++) {
  if ($isLight[$start] -and -not $isBg[$start] -and -not $labelVisited[$start]) {
    $comp = New-Object System.Collections.Generic.List[int]
    $q2 = New-Object System.Collections.Generic.Queue[int]
    $labelVisited[$start] = $true
    $q2.Enqueue($start)
    $minX = $w; $maxX = 0; $minY = $h; $maxY = 0
    while ($q2.Count -gt 0) {
      $i = $q2.Dequeue()
      $comp.Add($i)
      $cy = [int]([Math]::Floor($i / $w))
      $cx = $i - $cy * $w
      if ($cx -lt $minX) { $minX = $cx }
      if ($cx -gt $maxX) { $maxX = $cx }
      if ($cy -lt $minY) { $minY = $cy }
      if ($cy -gt $maxY) { $maxY = $cy }
      if ($cx -gt 0) { $ni = $i - 1; if ($isLight[$ni] -and -not $isBg[$ni] -and -not $labelVisited[$ni]) { $labelVisited[$ni] = $true; $q2.Enqueue($ni) } }
      if ($cx -lt $w - 1) { $ni = $i + 1; if ($isLight[$ni] -and -not $isBg[$ni] -and -not $labelVisited[$ni]) { $labelVisited[$ni] = $true; $q2.Enqueue($ni) } }
      if ($cy -gt 0) { $ni = $i - $w; if ($isLight[$ni] -and -not $isBg[$ni] -and -not $labelVisited[$ni]) { $labelVisited[$ni] = $true; $q2.Enqueue($ni) } }
      if ($cy -lt $h - 1) { $ni = $i + $w; if ($isLight[$ni] -and -not $isBg[$ni] -and -not $labelVisited[$ni]) { $labelVisited[$ni] = $true; $q2.Enqueue($ni) } }
    }
    $bboxArea = ($maxX - $minX + 1) * ($maxY - $minY + 1)
    $fillRatio = $comp.Count / [double]$bboxArea
    if ($comp.Count -ge $holeThreshold -and $fillRatio -ge $minFillRatio) {
      foreach ($i in $comp) { $isBg[$i] = $true }
    }
  }
}
Write-Output "enclosed holes: $($sw.ElapsedMilliseconds)ms"

# Separable dilation by radius (sliding-window OR), horizontal then vertical
$radius = 2
$dilH = New-Object bool[] $n
for ($y = 0; $y -lt $h; $y++) {
  $rowBase = $y * $w
  $count = 0
  for ($x = 0; $x -lt ([Math]::Min($radius, $w - 1)); $x++) { if ($isBg[$rowBase + $x]) { $count++ } }
  for ($x = 0; $x -lt $w; $x++) {
    $addX = $x + $radius
    if ($addX -lt $w -and $addX -gt ($x + $radius - 1)) {}
    if ($x -gt 0) {
      $enter = $x + $radius
      $leave = $x - $radius - 1
      if ($enter -lt $w -and $isBg[$rowBase + $enter]) { $count++ }
      if ($leave -ge 0 -and $isBg[$rowBase + $leave]) { $count-- }
    }
    if ($count -gt 0) { $dilH[$rowBase + $x] = $true }
  }
}
Write-Output "dilate-h: $($sw.ElapsedMilliseconds)ms"

$dilated = New-Object bool[] $n
for ($x = 0; $x -lt $w; $x++) {
  $count = 0
  for ($y = 0; $y -lt ([Math]::Min($radius, $h - 1)); $y++) { if ($dilH[$y * $w + $x]) { $count++ } }
  for ($y = 0; $y -lt $h; $y++) {
    if ($y -gt 0) {
      $enter = $y + $radius
      $leave = $y - $radius - 1
      if ($enter -lt $h -and $dilH[$enter * $w + $x]) { $count++ }
      if ($leave -ge 0 -and $dilH[$leave * $w + $x]) { $count-- }
    }
    if ($count -gt 0) { $dilated[$y * $w + $x] = $true }
  }
}
Write-Output "dilate-v: $($sw.ElapsedMilliseconds)ms"

# Paint radial studio-gradient over dilated background pixels
$cx0 = $w / 2.0
$cy0 = $h / 2.0
$maxDist = [Math]::Sqrt($cx0*$cx0 + $cy0*$cy0)
$centerC = @(78, 80, 86)
$edgeC   = @(22, 23, 26)

for ($y = 0; $y -lt $h; $y++) {
  $rowOff = $y * $stride
  $rowBase = $y * $w
  $dy = $y - $cy0
  for ($x = 0; $x -lt $w; $x++) {
    $i = $rowBase + $x
    if ($dilated[$i]) {
      $dx = $x - $cx0
      $d = [Math]::Sqrt($dx*$dx + $dy*$dy) / $maxDist
      if ($d -gt 1) { $d = 1 }
      $t = [Math]::Pow($d, 1.4)
      $r = [int]($centerC[0] + ($edgeC[0] - $centerC[0]) * $t)
      $g = [int]($centerC[1] + ($edgeC[1] - $centerC[1]) * $t)
      $b = [int]($centerC[2] + ($edgeC[2] - $centerC[2]) * $t)
      $off = $rowOff + $x * 3
      $bytes[$off]     = [byte]$b
      $bytes[$off + 1] = [byte]$g
      $bytes[$off + 2] = [byte]$r
    }
  }
}
Write-Output "paint: $($sw.ElapsedMilliseconds)ms"

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $bmpData.Scan0, $total)
$bmp.UnlockBits($bmpData)

$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]90)
$tmp = "$Path.tmp.jpg"
$bmp.Save($tmp, $encoder, $encParams)
$bmp.Dispose()
Move-Item -Force $tmp $Path

Write-Output "done: $($sw.ElapsedMilliseconds)ms"
