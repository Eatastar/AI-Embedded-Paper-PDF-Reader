param(
    [ValidateRange(1, 60)]
    [int]$ObservationSeconds = 20
)

# This tool changes no saved environment, application data, ACL, or security setting.
# The caller runs it in a separate PowerShell process; only the launched child
# inherits the temporary logging variables below.
$ErrorActionPreference = 'Stop'
$report = New-Object 'System.Collections.Generic.List[string]'
$root = $PSScriptRoot
$runDirectory = $null

function Add-Report([string]$Message) {
    $report.Add($Message)
}

function Save-Report {
    if ($runDirectory) {
        $report | Set-Content -LiteralPath (Join-Path $runDirectory '诊断结果.txt') -Encoding UTF8
    }
}

function Get-ExecutableArchitecture([string]$Path) {
    $stream = [System.IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
    $reader = New-Object System.IO.BinaryReader($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5A4D) { return '不是有效的 Windows EXE' }
        $stream.Position = 0x3C
        $headerOffset = $reader.ReadInt32()
        if ($headerOffset -lt 0 -or $headerOffset -gt ($stream.Length - 6)) { return 'EXE 文件头不完整' }
        $stream.Position = $headerOffset
        if ($reader.ReadUInt32() -ne 0x00004550) { return 'EXE 文件头无效' }
        switch ($reader.ReadUInt16()) {
            0x8664 { return 'x64' }
            0xAA64 { return 'ARM64' }
            0x014C { return 'x86（portable 启动器可以是 x86，内部客户端仍可以是 x64）' }
            default { return '未知架构' }
        }
    }
    finally { $reader.Dispose(); $stream.Dispose() }
}

function Get-ClientProcesses {
    # Read only this client's process names. Do not inspect command lines or kill processes.
    @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessName -eq 'LearnSomething' -or
        $_.ProcessName -eq 'learn something' -or
        $_.ProcessName -eq 'MarginChat' -or
        $_.ProcessName -eq '页边 Margin' -or
        $_.ProcessName -match '^(?:LearnSomething|MarginChat)-\d+(?:\.\d+){1,3}-Windows-(?:x64|arm64|ia32)$'
    } | ForEach-Object {
        [PSCustomObject]@{ Id = $_.Id; Name = $_.ProcessName }
    })
}

function Format-ClientProcesses($Processes) {
    if (@($Processes).Count -eq 0) { return '未发现' }
    return (($Processes | ForEach-Object { '{0} (PID {1})' -f $_.Name, $_.Id }) -join '；')
}

function Save-StartupExcerpts([string]$RawDirectory, [string]$OutputDirectory) {
    $excerpts = New-Object 'System.Collections.Generic.List[string]'
    $excerpts.Add('以下只摘录本次观察期的启动日志头尾，并屏蔽常见密钥格式。')
    $excerpts.Add('发送前请自行检查是否有密钥、聊天内容或其他私人信息；不要发送“本机原始日志”文件夹。')
    foreach ($logName in @('stdout-startup.log', 'stderr-startup.log', 'electron-startup.log')) {
        $logPath = Join-Path $RawDirectory $logName
        $excerpts.Add('')
        $excerpts.Add('===== ' + $logName + ' =====')
        if (-not (Test-Path -LiteralPath $logPath -PathType Leaf)) {
            $excerpts.Add('没有生成此日志。')
            continue
        }
        $stream = [System.IO.File]::Open($logPath, 'Open', 'Read', 'ReadWrite')
        try {
            $length = $stream.Length
            if ($length -eq 0) { $excerpts.Add('日志为空。'); continue }
            $buffer = New-Object byte[] ([int][Math]::Min(65536, $length))
            if ($length -gt 65536) {
                $null = $stream.Read($buffer, 0, 32768)
                $stream.Position = $length - 32768
                $null = $stream.Read($buffer, 32768, 32768)
            }
            else { $null = $stream.Read($buffer, 0, $buffer.Length) }
            $lines = @(([Text.Encoding]::UTF8.GetString($buffer)) -split '\r?\n')
            if ($lines.Count -gt 80) {
                $lines = @($lines | Select-Object -First 40) + @('（中间内容省略）') + @($lines | Select-Object -Last 40)
            }
            if ($length -gt 65536) { $excerpts.Add('原始日志超过 64 KiB，仅采集开头和结尾。') }
            foreach ($line in $lines) {
                $safe = [regex]::Replace($line, '(?i)\bsk-[a-z0-9_-]{8,}', '[密钥已隐藏]')
                $safe = [regex]::Replace($safe, '(?i)(bearer\s+)[a-z0-9._~+/=-]+', '$1[密钥已隐藏]')
                $keyPattern = @'
(?i)((?:api[_-]?key|authorization|x-margin-session)["']?\s*[:=]\s*["']?)[^\s"',;]+
'@
                $safe = [regex]::Replace($safe, $keyPattern.Trim(), '$1[密钥已隐藏]')
                if ($safe.Length -gt 2000) { $safe = $safe.Substring(0, 2000) + '（本行已截短）' }
                $excerpts.Add($safe)
            }
        }
        finally { $stream.Dispose() }
    }
    $excerpts | Set-Content -LiteralPath (Join-Path $OutputDirectory '启动日志摘录.txt') -Encoding UTF8
}

function Start-ClientWithDiagnosticLogging([string]$Path, [string]$OutputDirectory) {
    $temporary = @{
        ELECTRON_ENABLE_LOGGING = '1'
        ELECTRON_LOG_FILE = (Join-Path $OutputDirectory 'electron-startup.log')
    }
    $previous = @{}
    try {
        foreach ($name in $temporary.Keys) {
            $previous[$name] = @{
                Exists = Test-Path -LiteralPath ('Env:\' + $name)
                Value = [Environment]::GetEnvironmentVariable($name, 'Process')
            }
            [Environment]::SetEnvironmentVariable($name, $temporary[$name], 'Process')
        }
        # -Environment is not available in Windows PowerShell 5.1. These two
        # process-local variables are restored immediately after child creation.
        Start-Process -FilePath $Path -WorkingDirectory $root -WindowStyle Hidden `
            -ArgumentList '--enable-logging=file', '--log-level=2' -PassThru `
            -RedirectStandardOutput (Join-Path $OutputDirectory 'stdout-startup.log') `
            -RedirectStandardError (Join-Path $OutputDirectory 'stderr-startup.log')
    }
    finally {
        foreach ($name in $previous.Keys) {
            if ($previous[$name].Exists) {
                [Environment]::SetEnvironmentVariable($name, $previous[$name].Value, 'Process')
            }
            else {
                Remove-Item -LiteralPath ('Env:\' + $name) -ErrorAction SilentlyContinue
            }
        }
    }
}

try {
    $diagnosticRoot = Join-Path $root '启动诊断'
    $runDirectory = Join-Path $diagnosticRoot ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $PID)
    New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
    Add-Report 'learn something 启动诊断'
    Add-Report ('开始时间：' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    Add-Report ('工具目录：' + $root)
    Add-Report ('系统版本：' + [Environment]::OSVersion.VersionString)
    Add-Report ('64 位系统：' + [Environment]::Is64BitOperatingSystem)
    Add-Report ('PowerShell 版本：' + $PSVersionTable.PSVersion.ToString())
    Add-Report ('系统架构：' + [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE', 'Process'))
    foreach ($name in @('ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_ENABLE_LOGGING', 'ELECTRON_LOG_FILE', 'MARGIN_TEST_USER_DATA', 'MARGIN_SMOKE_REPORT')) {
        $present = $null -ne [Environment]::GetEnvironmentVariable($name, 'Process')
        Add-Report ('原有环境变量 {0}：{1}（不记录内容）' -f $name, $(if ($present) { '存在' } else { '不存在' }))
    }

    $candidates = @(Get-ChildItem -LiteralPath $root -File | ForEach-Object {
        $version = $null
        if ($_.Name -match '^(?:LearnSomething|MarginChat)-(\d+(?:\.\d+){1,3})-Windows-(?:x64|arm64|ia32)\.exe$') {
            try { $version = [version]$Matches[1] } catch { return }
        }
        elseif ($_.Name -in @('LearnSomething.exe', 'learn something.exe', 'MarginChat.exe', '页边 Margin.exe')) {
            $version = [version]'0.0'
        }
        else { return }
        [PSCustomObject]@{ File = $_; Version = $version }
    } | Sort-Object -Property @{ Expression = { $_.Version }; Descending = $true }, @{ Expression = { $_.File.LastWriteTimeUtc }; Descending = $true })

    if ($candidates.Count -eq 0) {
        throw '同目录没有找到 learn something 的 EXE。请把诊断工具与 EXE 放在同一个文件夹，解压版请先完整解压。'
    }
    $executable = $candidates[0].File
    Add-Report ('选择文件：' + $executable.FullName)
    Add-Report ('文件大小：' + $executable.Length + ' 字节')
    Add-Report ('EXE 架构：' + (Get-ExecutableArchitecture $executable.FullName))
    Add-Report ('SHA256：' + (Get-FileHash -LiteralPath $executable.FullName -Algorithm SHA256).Hash)
    if ($candidates.Count -gt 1) {
        Add-Report ('同目录找到 {0} 个客户端 EXE，已按版本号优先选择；若要测试其他文件，请将其与这两个诊断工具放入单独的文件夹。' -f $candidates.Count)
    }
    $before = @(Get-ClientProcesses)
    Add-Report ('启动前客户端进程：' + (Format-ClientProcesses $before))
    Add-Report ('观察时长：' + $ObservationSeconds + ' 秒')
    Save-Report

    Write-Host ('正在启动“' + $executable.Name + '”，请等待约 ' + $ObservationSeconds + ' 秒。')
    Write-Host '如果软件窗口打开，请先不要填写密钥或发起聊天，等诊断完成。'
    $rawDirectory = Join-Path $runDirectory '本机原始日志'
    New-Item -ItemType Directory -Path $rawDirectory -Force | Out-Null
    $process = Start-ClientWithDiagnosticLogging $executable.FullName $rawDirectory
    # Keep an opened process handle, so Windows PowerShell retains the real exit code.
    $null = $process.Handle
    Add-Report ('本次启动 PID：' + $process.Id)
    Save-Report
    $deadline = (Get-Date).AddSeconds($ObservationSeconds)
    while ((Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
    $process.Refresh()
    if ($process.HasExited) {
        $exitCode = $process.ExitCode
        if ($null -eq $exitCode) {
            Add-Report '启动进程已退出，但系统未返回退出码。'
        }
        else {
            $hexCode = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$exitCode), 0).ToString('X8')
            Add-Report ('启动进程已退出，退出码：{0}（0x{1}）' -f $exitCode, $hexCode)
        }
    }
    else {
        Add-Report '启动进程在观察结束时仍运行。本工具没有结束它；是否成功显示窗口需要你确认。'
    }
    $after = @(Get-ClientProcesses)
    Add-Report ('观察结束客户端进程：' + (Format-ClientProcesses $after))
    $newProcesses = @($after | Where-Object { $before.Id -notcontains $_.Id })
    Add-Report ('新增客户端进程数：' + $newProcesses.Count)
    if ($process.HasExited -and $after.Count -gt 0) {
        Add-Report '提示：portable 启动器退出时客户端子进程可能继续运行；也可能把窗口交给了原有实例。退出码本身不代表客户端启动失败。'
    }
    if ($process.HasExited -and $after.Count -eq 0) {
        Add-Report '未发现仍在运行的客户端，请结合下面的启动日志判断原因。'
    }
    foreach ($logName in @('stdout-startup.log', 'stderr-startup.log', 'electron-startup.log')) {
        $logPath = Join-Path $rawDirectory $logName
        if (Test-Path -LiteralPath $logPath -PathType Leaf) {
            Add-Report ('{0}：{1} 字节' -f $logName, (Get-Item -LiteralPath $logPath).Length)
        }
        else {
            Add-Report ($logName + '：没有生成。可能尚未进入 Electron 启动阶段，或该构建未输出此类日志。')
        }
    }
    Save-StartupExcerpts $rawDirectory $runDirectory
    Add-Report ('结束时间：' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    Add-Report '工具未读取聊天数据库或 API 密钥，未修改系统配置，未关闭沙盒或安全防护，未结束任何客户端进程。'
    Add-Report '这里只观察进程和启动错误；没有窗口是否可见的自动判定。日志保存在本机，不会自动上传。'
    Add-Report '客户端仍运行时，原始错误日志可能继续写入；摘录只截取本次观察期。请不要发送“本机原始日志”文件夹。'
    Add-Report '发送前先检查文本内没有密钥、聊天内容或其他私人信息。只需发送本目录的诊断结果.txt 和启动日志摘录.txt，并说明软件窗口有没有出现。'
    Save-Report
    Write-Host ''
    Write-Host '诊断已完成。请先检查文本内容，再把下面目录里的“诊断结果.txt”和“启动日志摘录.txt”发回来：'
    Write-Host $runDirectory
}
catch {
    Add-Report ('诊断未完成：' + $_.Exception.Message)
    if ($runDirectory -and (Test-Path -LiteralPath $runDirectory -PathType Container)) {
        Save-Report
        Write-Host ('错误详情已保存到：' + (Join-Path $runDirectory '诊断结果.txt'))
    }
    else {
        Write-Host '无法在当前目录保存诊断文件。请把整个客户端文件夹复制到可写的普通文件夹再试，不需要管理员权限。'
    }
    Write-Host $_.Exception.Message
    exit 1
}
