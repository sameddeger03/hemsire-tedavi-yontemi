$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class TedaviRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Document
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string Name;
        [MarshalAs(UnmanagedType.LPWStr)] public string Output;
        [MarshalAs(UnmanagedType.LPWStr)] public string DataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string name, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint StartDocPrinter(IntPtr printer, uint level, ref Document document);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr printer, byte[] data, uint length, out uint written);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool AbortPrinter(IntPtr printer);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printer);

    private static void Check(bool success, string operation)
    {
        if (success) return;
        int code = Marshal.GetLastWin32Error();
        throw new Win32Exception(code, operation + " (Windows " + code + "): " + new Win32Exception(code).Message);
    }

    public static uint Send(string name, byte[] data)
    {
        if (String.IsNullOrWhiteSpace(name) || data == null || data.Length == 0 || data.Length > 1048576)
            throw new ArgumentException("Invalid printer or label data.");
        IntPtr printer;
        Check(OpenPrinter(name, out printer, IntPtr.Zero), "OpenPrinter");
        bool started = false;
        try
        {
            var document = new Document { Name = "Tedavi etiketi", DataType = "RAW" };
            uint job = StartDocPrinter(printer, 1, ref document);
            Check(job != 0, "StartDocPrinter");
            started = true;
            Check(StartPagePrinter(printer), "StartPagePrinter");
            uint written;
            Check(WritePrinter(printer, data, (uint)data.Length, out written), "WritePrinter");
            if (written != data.Length) throw new IOException("Incomplete label data; print job cancelled.");
            Check(EndPagePrinter(printer), "EndPagePrinter");
            Check(EndDocPrinter(printer), "EndDocPrinter");
            started = false;
            return job;
        }
        finally
        {
            if (started) AbortPrinter(printer);
            ClosePrinter(printer);
        }
    }
}
'@
    $jobId = [TedaviRawPrinter]::Send([string]$request.printerName, [Convert]::FromBase64String($request.data))
    [Console]::Out.WriteLine((@{ jobId = $jobId } | ConvertTo-Json -Compress))
} catch {
    [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
    exit 1
}
