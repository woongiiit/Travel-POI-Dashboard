using System.Diagnostics;
using System.IO.Compression;
using System.Net.Sockets;
using System.Reflection;
using System.Text;

internal static class Program
{
    private const string AppName = "CarbonTourismDashboard";
    private const string Version = "1.0.0";
    private const int PreferredPort = 3000;

    [STAThread]
    private static int Main()
    {
        try
        {
            var appDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                AppName,
                Version);

            var firstRun = !File.Exists(Path.Combine(appDir, ".ready"));
            EnsurePayload(appDir);
            if (firstRun)
            {
                EnsureBlankSecrets(appDir);
            }

            var port = FindFreePort(PreferredPort);
            var node = Path.Combine(appDir, "node.exe");
            var serverJs = Path.Combine(appDir, "server.js");
            if (!File.Exists(node) || !File.Exists(serverJs))
            {
                Message("실행 파일이 준비되지 않았습니다.\nEXE와 같은 폴더에 app.zip 이 있는지 확인해 주세요.", true);
                return 1;
            }

            var psi = new ProcessStartInfo
            {
                FileName = node,
                Arguments = "server.js",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            psi.Environment["PORT"] = port.ToString();
            psi.Environment["HOSTNAME"] = "127.0.0.1";
            psi.Environment["NODE_ENV"] = "production";

            using var proc = Process.Start(psi);
            if (proc is null)
            {
                Message("서버를 시작하지 못했습니다.", true);
                return 1;
            }

            if (!WaitForPort(port, TimeSpan.FromSeconds(90)))
            {
                try { proc.Kill(entireProcessTree: true); } catch { /* ignore */ }
                Message("서버 기동 시간이 초과되었습니다.\n방화벽/백신 프로그램을 확인한 뒤 다시 시도해 주세요.", true);
                return 1;
            }

            var url = $"http://127.0.0.1:{port}";
            try
            {
                Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            }
            catch
            {
                Message($"브라우저를 자동으로 열지 못했습니다.\n주소창에 직접 입력해 주세요:\n{url}", false);
            }

            Message(
                "탄소중립 관광 대시보드가 실행 중입니다.\n\n" +
                $"주소: {url}\n\n" +
                "• 우측 상단 [환경 설정]에서 HuggingFace 토큰을 입력하세요.\n" +
                "• 이 안내 창을 닫으면 서비스가 종료됩니다.",
                false);

            try { proc.Kill(entireProcessTree: true); } catch { /* ignore */ }
            return 0;
        }
        catch (Exception ex)
        {
            Message("실행 중 오류가 발생했습니다.\n\n" + ex.Message, true);
            return 1;
        }
    }

    private static void EnsurePayload(string appDir)
    {
        var marker = Path.Combine(appDir, ".ready");
        if (File.Exists(marker)) return;

        Directory.CreateDirectory(appDir);

        // 1) EXE 옆 app.zip  2) 내장 리소스(작은 테스트용)
        var beside = Path.Combine(AppContext.BaseDirectory, "app.zip");
        string zipPath;
        var tempZip = Path.Combine(Path.GetTempPath(), $"carbon-payload-{Guid.NewGuid():N}.zip");
        var deleteTemp = false;

        if (File.Exists(beside))
        {
            zipPath = beside;
        }
        else
        {
            var asm = Assembly.GetExecutingAssembly();
            using var stream = asm.GetManifestResourceStream("Payload.app.zip");
            if (stream is null)
                throw new InvalidOperationException("app.zip 을 찾을 수 없습니다. EXE와 같은 폴더에 app.zip 을 두세요.");
            using (var fs = File.Create(tempZip))
                stream.CopyTo(fs);
            zipPath = tempZip;
            deleteTemp = true;
        }

        try
        {
            ZipFile.ExtractToDirectory(zipPath, appDir, overwriteFiles: true);
            File.WriteAllText(marker, DateTime.UtcNow.ToString("o"), Encoding.UTF8);
        }
        finally
        {
            if (deleteTemp)
            {
                try { File.Delete(tempZip); } catch { /* ignore */ }
            }
        }
    }

    private static void EnsureBlankSecrets(string appDir)
    {
        var envPath = Path.Combine(appDir, ".env.local");
        var settingsPath = Path.Combine(appDir, "data", "local-settings.json");
        Directory.CreateDirectory(Path.Combine(appDir, "data"));

        File.WriteAllText(envPath,
            "KTO_SERVICE_KEY=\n" +
            "HUGGINGFACE_API_KEY=\n" +
            "HUGGINGFACE_MODEL=Qwen/Qwen2.5-7B-Instruct\n" +
            "HUGGINGFACE_TEMPERATURE=0.4\n" +
            "TAVILY_API_KEY=\n",
            Encoding.UTF8);

        if (File.Exists(settingsPath))
        {
            try { File.Delete(settingsPath); } catch { /* ignore */ }
        }
    }

    private static int FindFreePort(int start)
    {
        for (var p = start; p < start + 40; p++)
        {
            try
            {
                var listener = new TcpListener(System.Net.IPAddress.Loopback, p);
                listener.Start();
                listener.Stop();
                return p;
            }
            catch
            {
                // next
            }
        }
        return start;
    }

    private static bool WaitForPort(int port, TimeSpan timeout)
    {
        var until = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < until)
        {
            try
            {
                using var client = new TcpClient();
                var task = client.ConnectAsync("127.0.0.1", port);
                if (task.Wait(500) && client.Connected) return true;
            }
            catch
            {
                // retry
            }
            Thread.Sleep(400);
        }
        return false;
    }

    private static void Message(string text, bool error)
    {
        MessageBox.Show(
            text,
            error ? "탄소중립 관광 대시보드 — 오류" : "탄소중립 관광 대시보드",
            MessageBoxButtons.OK,
            error ? MessageBoxIcon.Error : MessageBoxIcon.Information);
    }
}
