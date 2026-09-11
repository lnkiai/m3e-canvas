; M3E Canvas installer pre-flight: the app is self-contained (Electron ships
; its own runtime), the only real configuration the tablet mirror needs is an
; open TCP 19876 on the LAN. This script detects that configuration, tries to
; set it up during install, and logs the results for troubleshooting.

; --- shared detection -------------------------------------------------------
; $R0 = "1" when port 19876 is already in use, else "0"
; $R1 = "1" when the firewall rule exists, else "0"
!macro m3eDetect
  StrCpy $R0 "0"
  StrCpy $R1 "0"
  nsExec::ExecToStack `powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 19876 -State Listen -ErrorAction SilentlyContinue) { exit 42 }"`
  Pop $0
  Pop $1
  ${If} $0 == "42"
    StrCpy $R0 "1"
  ${EndIf}
  nsExec::ExecToStack `netsh advfirewall firewall show rule name=M3ECanvasMirror`
  Pop $0
  Pop $1
  ${If} $0 == "0"
    StrCpy $R1 "1"
  ${EndIf}
!macroend

; --- before the install UI: report what was found ---------------------------
!macro customInit
  !insertmacro m3eDetect
  ${IfNot} ${Silent}
    ${If} $R0 == "1"
      MessageBox MB_ICONEXCLAMATION|MB_OK "检测结果：端口 19876 已被其他程序占用。$\n平板镜像功能可能无法启动，建议安装后关闭占用该端口的程序。$\n$\n（不影响软件其他功能，可继续安装。）" /SD IDOK
    ${EndIf}
    ${If} $R1 == "0"
      MessageBox MB_ICONINFORMATION|MB_OK "检测结果：防火墙尚未放行「平板镜像」所需的局域网端口（TCP 19876）。$\n$\n安装过程中会自动添加一条仅限本机子网的放行规则，届时请允许 UAC 授权窗口。$\n若跳过授权，首次使用平板连接时 Windows 也会再次询问。" /SD IDOK
    ${EndIf}
  ${EndIf}
!macroend

; --- during install: add the firewall rule, write the check log -------------
!macro customInstall
  !insertmacro m3eDetect
  ${If} $R1 == "0"
    ${IfNot} ${Silent}
      ; the only elevated step: one UAC prompt for netsh (rule is scoped to
      ; the local subnet and this single port)
      nsExec::Exec `powershell.exe -NoProfile -Command "Start-Process netsh -Verb RunAs -Wait -ArgumentList 'advfirewall firewall add rule name=M3ECanvasMirror dir=in action=allow protocol=TCP localport=19876 remoteip=localsubnet'"`
      Pop $0
    ${EndIf}
    nsExec::ExecToStack `netsh advfirewall firewall show rule name=M3ECanvasMirror`
    Pop $0
    Pop $1
    ${If} $0 == "0"
      StrCpy $R1 "1"
    ${EndIf}
  ${EndIf}
  FileOpen $0 "$INSTDIR\install-check.log" w
  FileWrite $0 "M3E Canvas 安装配置检测$\r$\n"
  FileWrite $0 "port_19876_in_use=$R0$\r$\n"
  FileWrite $0 "firewall_rule_ready=$R1$\r$\n"
  ${If} $R1 == "1"
    FileWrite $0 "平板镜像所需端口已放行（仅限本机子网）。$\r$\n"
  ${Else}
    FileWrite $0 "防火墙规则未添加：可忽略，首次使用平板连接时 Windows 会询问放行；$\r$\n或以管理员运行：netsh advfirewall firewall add rule name=M3ECanvasMirror dir=in action=allow protocol=TCP localport=19876 remoteip=localsubnet$\r$\n"
  ${EndIf}
  ${If} $R0 == "1"
    FileWrite $0 "注意：安装时端口 19876 被占用，镜像服务可能无法启动。$\r$\n"
  ${EndIf}
  FileWrite $0 "使用平板镜像时，请确保平板与电脑处于同一 Wi-Fi。$\r$\n"
  FileClose $0
!macroend

; --- uninstall: remove the rule and the log ---------------------------------
!macro customUnInstall
  ${IfNot} ${Silent}
    nsExec::Exec `powershell.exe -NoProfile -Command "Start-Process netsh -Verb RunAs -Wait -ArgumentList 'advfirewall firewall delete rule name=M3ECanvasMirror'"`
  ${EndIf}
  Delete "$INSTDIR\install-check.log"
!macroend
