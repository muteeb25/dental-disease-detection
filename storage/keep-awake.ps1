Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class TrainingPowerRequest {
    [DllImport("kernel32.dll")]
    public static extern uint SetThreadExecutionState(uint flags);
}
'@
[TrainingPowerRequest]::SetThreadExecutionState(0x80000001) | Out-Null
while ($true) { Start-Sleep -Seconds 30 }
