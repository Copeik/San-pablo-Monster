using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace PokemonAdventureSharedLauncher
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            if (args.Any(delegate(string argument)
                { return string.Equals(argument, "--self-test", StringComparison.OrdinalIgnoreCase); }))
            {
                Environment.Exit(SelfTest.Run());
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    internal static class InvitationCode
    {
        private const string Prefix = "PA1.";

        public static string Encode(string inviteUrl)
        {
            Uri validatedUrl;
            string error;
            if (!TryValidateUrl(inviteUrl, out validatedUrl, out error))
            {
                throw new ArgumentException(error, "inviteUrl");
            }

            byte[] bytes = Encoding.UTF8.GetBytes(validatedUrl.AbsoluteUri);
            return Prefix + Convert.ToBase64String(bytes)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }

        public static bool TryDecode(string input, out string inviteUrl, out string error)
        {
            inviteUrl = null;
            error = null;
            string normalized = (input ?? string.Empty).Trim();

            if (normalized.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                normalized.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                Uri directUrl;
                if (!TryValidateUrl(normalized, out directUrl, out error))
                {
                    return false;
                }

                inviteUrl = directUrl.AbsoluteUri;
                return true;
            }

            normalized = Regex.Replace(normalized, @"\s+", string.Empty);
            if (!normalized.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
            {
                error = "El código debe empezar por PA1. Pégalo completo, sin modificarlo.";
                return false;
            }

            try
            {
                string payload = normalized.Substring(Prefix.Length)
                    .Replace('-', '+')
                    .Replace('_', '/');
                int remainder = payload.Length % 4;
                if (remainder != 0)
                {
                    payload = payload.PadRight(payload.Length + (4 - remainder), '=');
                }

                string decodedUrl = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                Uri validatedUrl;
                if (!TryValidateUrl(decodedUrl, out validatedUrl, out error))
                {
                    return false;
                }

                inviteUrl = validatedUrl.AbsoluteUri;
                return true;
            }
            catch (FormatException)
            {
                error = "El código no es válido o está incompleto.";
                return false;
            }
            catch (ArgumentException)
            {
                error = "El código no es válido o está incompleto.";
                return false;
            }
        }

        private static bool TryValidateUrl(string value, out Uri url, out string error)
        {
            error = null;
            if (!Uri.TryCreate(value, UriKind.Absolute, out url) ||
                (url.Scheme != Uri.UriSchemeHttp && url.Scheme != Uri.UriSchemeHttps))
            {
                error = "La invitación no contiene una dirección válida.";
                return false;
            }

            Match tokenMatch = Regex.Match(url.Query, @"(?:^|[?&])editorToken=([^&]+)", RegexOptions.IgnoreCase);
            if (!tokenMatch.Success || string.IsNullOrWhiteSpace(tokenMatch.Groups[1].Value))
            {
                error = "La invitación no contiene el token de edición compartida.";
                return false;
            }

            return true;
        }
    }

    internal static class SelfTest
    {
        public static int Run()
        {
            try
            {
                string source = "https://example.test:4173/?editorToken=token-de-prueba_123";
                string code = InvitationCode.Encode(source);
                string decoded;
                string error;

                if (!code.StartsWith("PA1.", StringComparison.Ordinal) ||
                    !InvitationCode.TryDecode(code, out decoded, out error) ||
                    decoded != source)
                {
                    return 10;
                }

                if (InvitationCode.TryDecode("PA1.incompleto", out decoded, out error))
                {
                    return 11;
                }

                if (!InvitationCode.TryDecode(source, out decoded, out error) || decoded != source)
                {
                    return 12;
                }

                if (InvitationCode.TryDecode("https://example.test/", out decoded, out error))
                {
                    return 13;
                }

                return 0;
            }
            catch
            {
                return 99;
            }
        }
    }

    internal sealed class LauncherForm : Form
    {
        private static readonly Color BackgroundColor = Color.FromArgb(17, 24, 39);
        private static readonly Color PanelColor = Color.FromArgb(31, 41, 55);
        private static readonly Color PrimaryColor = Color.FromArgb(250, 204, 21);
        private static readonly Color SecondaryColor = Color.FromArgb(59, 130, 246);
        private static readonly Color TextColor = Color.FromArgb(243, 244, 246);
        private static readonly Color MutedColor = Color.FromArgb(156, 163, 175);
        private static readonly Color SuccessColor = Color.FromArgb(52, 211, 153);
        private static readonly Color ErrorColor = Color.FromArgb(248, 113, 113);

        private readonly Panel _contentPanel;
        private readonly object _diagnosticsLock = new object();
        private readonly StringBuilder _serverDiagnostics = new StringBuilder();
        private readonly StringBuilder _tunnelDiagnostics = new StringBuilder();

        private Process _serverProcess;
        private Process _tunnelProcess;
        private CancellationTokenSource _startupCancellation;
        private Label _hostStatusLabel;
        private TextBox _hostUrlBox;
        private TextBox _hostCodeBox;
        private Button _copyUrlButton;
        private Button _copyCodeButton;
        private Button _openHostButton;
        private string _hostInviteUrl;
        private bool _hosting;

        public LauncherForm()
        {
            Text = "Pokémon Adventure · Servidor compartido";
            ClientSize = new Size(760, 610);
            MinimumSize = new Size(700, 570);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = BackgroundColor;
            ForeColor = TextColor;
            Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            AutoScaleMode = AutoScaleMode.Dpi;

            TableLayoutPanel root = new TableLayoutPanel();
            root.Dock = DockStyle.Fill;
            root.Padding = new Padding(28, 22, 28, 26);
            root.ColumnCount = 1;
            root.RowCount = 3;
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            Controls.Add(root);

            Label title = new Label();
            title.Text = "POKÉMON ADVENTURE";
            title.AutoSize = true;
            title.Font = new Font("Segoe UI", 20F, FontStyle.Bold, GraphicsUnit.Point);
            title.ForeColor = PrimaryColor;
            title.Margin = new Padding(0, 0, 0, 2);
            root.Controls.Add(title, 0, 0);

            Label subtitle = new Label();
            subtitle.Text = "Edición compartida";
            subtitle.AutoSize = true;
            subtitle.Font = new Font("Segoe UI", 12F, FontStyle.Regular, GraphicsUnit.Point);
            subtitle.ForeColor = MutedColor;
            subtitle.Margin = new Padding(2, 0, 0, 18);
            root.Controls.Add(subtitle, 0, 1);

            _contentPanel = new Panel();
            _contentPanel.Dock = DockStyle.Fill;
            _contentPanel.BackColor = PanelColor;
            _contentPanel.Padding = new Padding(30);
            root.Controls.Add(_contentPanel, 0, 2);

            FormClosing += delegate
            {
                StopHosting();
            };

            ShowHome();
        }

        private void ShowHome()
        {
            _contentPanel.Controls.Clear();

            TableLayoutPanel layout = CreateContentLayout(5);
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 18F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50F));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50F));

            layout.Controls.Add(CreateHeading("¿Cómo quieres entrar?"), 0, 0);
            layout.Controls.Add(CreateDescription(
                "El host inicia el servidor y recibe una URL y un código. El invitado solo pega ese código."), 0, 1);

            Button hostButton = CreateLargeButton("SOY HOST", "Crear una nueva sesión compartida", PrimaryColor, Color.FromArgb(17, 24, 39));
            hostButton.Click += delegate { ShowHost(); };
            layout.Controls.Add(hostButton, 0, 3);

            Button guestButton = CreateLargeButton("SOY INVITADO", "Entrar usando el código del host", SecondaryColor, Color.White);
            guestButton.Click += delegate { ShowGuest(); };
            layout.Controls.Add(guestButton, 0, 4);

            _contentPanel.Controls.Add(layout);
        }

        private void ShowHost()
        {
            StopHosting();
            _contentPanel.Controls.Clear();

            TableLayoutPanel layout = CreateContentLayout(10);
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64F));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 100F));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

            layout.Controls.Add(CreateHeading("Sesión del host"), 0, 0);
            layout.Controls.Add(CreateDescription(
                "Mantén esta ventana abierta mientras editáis. Comparte únicamente el código con tus invitados."), 0, 1);

            _hostStatusLabel = CreateDescription("Preparando el servidor…");
            _hostStatusLabel.ForeColor = PrimaryColor;
            _hostStatusLabel.Margin = new Padding(0, 12, 0, 12);
            layout.Controls.Add(_hostStatusLabel, 0, 2);

            layout.Controls.Add(CreateFieldLabel("URL DE INVITACIÓN"), 0, 3);
            TableLayoutPanel urlRow = CreateCopyRow(out _hostUrlBox, out _copyUrlButton, "Copiar URL");
            _copyUrlButton.Enabled = false;
            _copyUrlButton.Click += delegate { CopyText(_hostUrlBox.Text, "URL copiada"); };
            layout.Controls.Add(urlRow, 0, 4);

            layout.Controls.Add(CreateFieldLabel("CÓDIGO PARA INVITADOS"), 0, 5);
            _hostCodeBox = CreateTextBox(true);
            _hostCodeBox.ScrollBars = ScrollBars.Vertical;
            layout.Controls.Add(_hostCodeBox, 0, 6);

            FlowLayoutPanel actions = new FlowLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.AutoSize = true;
            actions.WrapContents = true;
            actions.Margin = new Padding(0, 12, 0, 4);

            _copyCodeButton = CreateButton("Copiar código", PrimaryColor, Color.FromArgb(17, 24, 39));
            _copyCodeButton.Enabled = false;
            _copyCodeButton.Click += delegate { CopyText(_hostCodeBox.Text, "Código copiado"); };
            actions.Controls.Add(_copyCodeButton);

            _openHostButton = CreateButton("Abrir juego", SecondaryColor, Color.White);
            _openHostButton.Enabled = false;
            _openHostButton.Click += delegate { OpenBrowser(_hostInviteUrl); };
            actions.Controls.Add(_openHostButton);

            Button stopButton = CreateButton("Detener y volver", Color.FromArgb(75, 85, 99), Color.White);
            stopButton.Click += delegate
            {
                StopHosting();
                ShowHome();
            };
            actions.Controls.Add(stopButton);
            layout.Controls.Add(actions, 0, 7);

            Label note = CreateDescription(
                "El código caduca al cerrar el lanzador. Si aparece “solo red local”, el invitado debe estar conectado a tu misma red." );
            note.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            layout.Controls.Add(note, 0, 8);

            _contentPanel.Controls.Add(layout);
            _startupCancellation = new CancellationTokenSource();
            BeginInvoke(new Action(delegate { StartHostingAsync(_startupCancellation.Token); }));
        }

        private void ShowGuest()
        {
            StopHosting();
            _contentPanel.Controls.Clear();

            TableLayoutPanel layout = CreateContentLayout(7);
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 145F));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

            layout.Controls.Add(CreateHeading("Entrar como invitado"), 0, 0);
            layout.Controls.Add(CreateDescription(
                "Pide el código al host y pégalo aquí. Se abrirá la sesión compartida en tu navegador."), 0, 1);
            layout.Controls.Add(CreateFieldLabel("CÓDIGO DE INVITACIÓN"), 0, 2);

            TextBox codeInput = CreateTextBox(false);
            codeInput.Multiline = true;
            codeInput.ScrollBars = ScrollBars.Vertical;
            codeInput.Font = new Font("Consolas", 10F, FontStyle.Regular, GraphicsUnit.Point);
            layout.Controls.Add(codeInput, 0, 3);

            Label resultLabel = CreateDescription(string.Empty);
            resultLabel.Margin = new Padding(0, 8, 0, 4);
            layout.Controls.Add(resultLabel, 0, 5);

            FlowLayoutPanel actions = new FlowLayoutPanel();
            actions.Dock = DockStyle.Fill;
            actions.AutoSize = true;
            actions.Margin = new Padding(0, 12, 0, 4);

            Button joinButton = CreateButton("Entrar a la sesión", PrimaryColor, Color.FromArgb(17, 24, 39));
            joinButton.Click += delegate
            {
                string inviteUrl;
                string error;
                if (!InvitationCode.TryDecode(codeInput.Text, out inviteUrl, out error))
                {
                    resultLabel.ForeColor = ErrorColor;
                    resultLabel.Text = error;
                    return;
                }

                resultLabel.ForeColor = SuccessColor;
                resultLabel.Text = "Código correcto. Abriendo la sesión…";
                OpenBrowser(inviteUrl);
            };
            actions.Controls.Add(joinButton);

            Button pasteButton = CreateButton("Pegar", SecondaryColor, Color.White);
            pasteButton.Click += delegate
            {
                try
                {
                    if (Clipboard.ContainsText())
                    {
                        codeInput.Text = Clipboard.GetText().Trim();
                    }
                }
                catch (Exception exception)
                {
                    resultLabel.ForeColor = ErrorColor;
                    resultLabel.Text = "No se pudo leer el portapapeles: " + exception.Message;
                }
            };
            actions.Controls.Add(pasteButton);

            Button backButton = CreateButton("Volver", Color.FromArgb(75, 85, 99), Color.White);
            backButton.Click += delegate { ShowHome(); };
            actions.Controls.Add(backButton);
            layout.Controls.Add(actions, 0, 4);

            _contentPanel.Controls.Add(layout);
            codeInput.Focus();
        }

        private async void StartHostingAsync(CancellationToken cancellationToken)
        {
            if (_hosting)
            {
                return;
            }

            _hosting = true;
            try
            {
                SetHostStatus("Buscando el servidor del proyecto…", PrimaryColor);
                string projectRoot = FindProjectRoot();
                if (projectRoot == null)
                {
                    throw new InvalidOperationException(
                        "No encuentro server.mjs. Coloca el ejecutable dentro de la carpeta pokemon-adventure y vuelve a intentarlo.");
                }

                string nodePath = FindExecutable("node.exe");
                if (nodePath == null)
                {
                    throw new InvalidOperationException(
                        "Node.js no está instalado o no aparece en PATH. Instálalo para poder alojar la sesión.");
                }

                int port = FindFreePort(4173, 4299);
                string token = GenerateToken();
                string localInviteUrl = BuildInviteUrl("127.0.0.1", port, token);
                string lanAddress = GetLanAddress();
                string lanInviteUrl = BuildInviteUrl(lanAddress, port, token);

                SetHostStatus("Iniciando el servidor compartido…", PrimaryColor);
                StartServer(nodePath, projectRoot, port, token);
                await WaitForServerAsync(port, cancellationToken);

                SetHostStatus("Servidor listo. Creando acceso por Internet…", PrimaryColor);
                string publicBaseUrl = await StartTunnelAsync(port, cancellationToken);
                cancellationToken.ThrowIfCancellationRequested();

                bool hasPublicTunnel = !string.IsNullOrWhiteSpace(publicBaseUrl);
                string inviteUrl = hasPublicTunnel
                    ? publicBaseUrl.TrimEnd('/') + "/?editorToken=" + Uri.EscapeDataString(token)
                    : lanInviteUrl;
                string code = InvitationCode.Encode(inviteUrl);

                _hostInviteUrl = inviteUrl;
                _hostUrlBox.Text = inviteUrl;
                _hostCodeBox.Text = code;
                _copyUrlButton.Enabled = true;
                _copyCodeButton.Enabled = true;
                _openHostButton.Enabled = true;

                if (hasPublicTunnel)
                {
                    SetHostStatus("Sesión pública lista · puerto " + port, SuccessColor);
                }
                else
                {
                    SetHostStatus("Sesión lista · solo red local · puerto " + port, PrimaryColor);
                }

                OpenBrowser(localInviteUrl);
            }
            catch (OperationCanceledException)
            {
                StopOwnedProcesses();
            }
            catch (Exception exception)
            {
                StopOwnedProcesses();
                SetHostStatus("No se pudo iniciar: " + exception.Message, ErrorColor);
            }
            finally
            {
                _hosting = false;
            }
        }

        private void StartServer(string nodePath, string projectRoot, int port, string token)
        {
            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = nodePath;
            startInfo.Arguments = Quote(Path.Combine(projectRoot, "server.mjs")) + " --collab";
            startInfo.WorkingDirectory = projectRoot;
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            startInfo.EnvironmentVariables["GAME_EDITOR_COLLAB"] = "1";
            startInfo.EnvironmentVariables["GAME_EDITOR_TOKEN"] = token;
            startInfo.EnvironmentVariables["GAME_EDITOR_REQUIRE_TOKEN"] = "1";
            startInfo.EnvironmentVariables["HOST"] = "0.0.0.0";
            startInfo.EnvironmentVariables["PORT"] = port.ToString();

            Process process = new Process();
            process.StartInfo = startInfo;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                AppendDiagnostic(_serverDiagnostics, eventArgs.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                AppendDiagnostic(_serverDiagnostics, eventArgs.Data);
            };

            if (!process.Start())
            {
                throw new InvalidOperationException("Node.js no ha podido arrancar el servidor.");
            }

            _serverProcess = process;
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }

        private async Task WaitForServerAsync(int port, CancellationToken cancellationToken)
        {
            string healthUrl = "http://127.0.0.1:" + port + "/api/health";
            for (int attempt = 0; attempt < 50; attempt++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (_serverProcess == null || _serverProcess.HasExited)
                {
                    string details = GetDiagnosticTail(_serverDiagnostics);
                    throw new InvalidOperationException("El servidor se cerró al iniciar." + details);
                }

                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(healthUrl);
                    request.Method = "GET";
                    request.Timeout = 600;
                    request.ReadWriteTimeout = 600;
                    Task<WebResponse> responseTask = request.GetResponseAsync();
                    Task completed = await Task.WhenAny(responseTask, Task.Delay(750, cancellationToken));
                    if (completed == responseTask)
                    {
                        using (WebResponse response = await responseTask)
                        {
                            HttpWebResponse httpResponse = response as HttpWebResponse;
                            if (httpResponse != null && httpResponse.StatusCode == HttpStatusCode.OK)
                            {
                                return;
                            }
                        }
                    }
                    else
                    {
                        request.Abort();
                    }
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch
                {
                    // El servidor puede tardar unos instantes en empezar a escuchar.
                }

                await Task.Delay(250, cancellationToken);
            }

            throw new TimeoutException("El servidor no respondió a tiempo." + GetDiagnosticTail(_serverDiagnostics));
        }

        private async Task<string> StartTunnelAsync(int port, CancellationToken cancellationToken)
        {
            string sshPath = FindExecutable("ssh.exe");
            if (sshPath == null)
            {
                return null;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = sshPath;
            startInfo.Arguments = "-T -o BatchMode=yes -o StrictHostKeyChecking=accept-new " +
                "-o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -o ConnectTimeout=10 " +
                "-R 80:localhost:" + port + " nokey@localhost.run";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;

            Process process = new Process();
            process.StartInfo = startInfo;
            TaskCompletionSource<string> addressSource = new TaskCompletionSource<string>();

            DataReceivedEventHandler outputHandler = delegate(object sender, DataReceivedEventArgs eventArgs)
            {
                AppendDiagnostic(_tunnelDiagnostics, eventArgs.Data);
                string address = FindTunnelAddress(eventArgs.Data);
                if (address != null)
                {
                    addressSource.TrySetResult(address);
                }
            };
            process.OutputDataReceived += outputHandler;
            process.ErrorDataReceived += outputHandler;
            process.EnableRaisingEvents = true;
            process.Exited += delegate { addressSource.TrySetResult(null); };

            try
            {
                if (!process.Start())
                {
                    process.Dispose();
                    return null;
                }

                _tunnelProcess = process;
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                Task timeoutTask = Task.Delay(25000, cancellationToken);
                Task completed = await Task.WhenAny(addressSource.Task, timeoutTask);
                cancellationToken.ThrowIfCancellationRequested();

                if (completed == addressSource.Task)
                {
                    string address = await addressSource.Task;
                    if (address != null)
                    {
                        return address;
                    }
                }

                StopProcess(process);
                if (object.ReferenceEquals(_tunnelProcess, process))
                {
                    _tunnelProcess = null;
                }
                return null;
            }
            catch
            {
                StopProcess(process);
                if (object.ReferenceEquals(_tunnelProcess, process))
                {
                    _tunnelProcess = null;
                }
                throw;
            }
        }

        private static string FindTunnelAddress(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return null;
            }

            Match match = Regex.Match(line, @"https://[a-z0-9][a-z0-9.-]*\.lhr\.life", RegexOptions.IgnoreCase);
            return match.Success ? match.Value : null;
        }

        private void StopHosting()
        {
            if (_startupCancellation != null)
            {
                try { _startupCancellation.Cancel(); }
                catch { }
                _startupCancellation.Dispose();
                _startupCancellation = null;
            }

            StopOwnedProcesses();
            _hosting = false;
            _hostInviteUrl = null;
        }

        private void StopOwnedProcesses()
        {
            Process tunnel = _tunnelProcess;
            Process server = _serverProcess;
            _tunnelProcess = null;
            _serverProcess = null;
            StopProcess(tunnel);
            StopProcess(server);
        }

        private static void StopProcess(Process process)
        {
            if (process == null)
            {
                return;
            }

            try
            {
                if (!process.HasExited)
                {
                    process.Kill();
                    process.WaitForExit(1500);
                }
            }
            catch
            {
                // El proceso puede haber terminado entre las comprobaciones.
            }
            finally
            {
                try { process.Dispose(); }
                catch { }
            }
        }

        private static string FindProjectRoot()
        {
            List<string> starts = new List<string>();
            starts.Add(AppDomain.CurrentDomain.BaseDirectory);
            starts.Add(Directory.GetCurrentDirectory());

            foreach (string start in starts.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                DirectoryInfo directory = new DirectoryInfo(start);
                for (int depth = 0; directory != null && depth < 7; depth++)
                {
                    if (File.Exists(Path.Combine(directory.FullName, "server.mjs")))
                    {
                        return directory.FullName;
                    }
                    directory = directory.Parent;
                }
            }

            return null;
        }

        private static string FindExecutable(string executableName)
        {
            if (string.Equals(executableName, "ssh.exe", StringComparison.OrdinalIgnoreCase))
            {
                string systemSsh = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "OpenSSH", "ssh.exe");
                if (File.Exists(systemSsh))
                {
                    return systemSsh;
                }
            }

            string path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
            foreach (string entry in path.Split(Path.PathSeparator))
            {
                string directory = entry.Trim().Trim('"');
                if (directory.Length == 0)
                {
                    continue;
                }

                try
                {
                    string candidate = Path.Combine(directory, executableName);
                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
                catch
                {
                    // Ignora entradas no válidas de PATH.
                }
            }

            return null;
        }

        private static int FindFreePort(int firstPort, int lastPort)
        {
            for (int port = firstPort; port <= lastPort; port++)
            {
                TcpListener listener = null;
                try
                {
                    listener = new TcpListener(IPAddress.Loopback, port);
                    listener.Start();
                    return port;
                }
                catch (SocketException)
                {
                    // Prueba el siguiente puerto.
                }
                finally
                {
                    if (listener != null)
                    {
                        listener.Stop();
                    }
                }
            }

            throw new InvalidOperationException("No hay ningún puerto libre entre " + firstPort + " y " + lastPort + ".");
        }

        private static string GenerateToken()
        {
            byte[] bytes = new byte[24];
            using (RandomNumberGenerator generator = new RNGCryptoServiceProvider())
            {
                generator.GetBytes(bytes);
            }

            return Convert.ToBase64String(bytes)
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }

        private static string GetLanAddress()
        {
            try
            {
                IEnumerable<IPAddress> addresses = NetworkInterface.GetAllNetworkInterfaces()
                    .Where(delegate(NetworkInterface adapter)
                    {
                        return adapter.OperationalStatus == OperationalStatus.Up &&
                            adapter.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                            adapter.NetworkInterfaceType != NetworkInterfaceType.Tunnel;
                    })
                    .SelectMany(delegate(NetworkInterface adapter)
                    {
                        return adapter.GetIPProperties().UnicastAddresses;
                    })
                    .Where(delegate(UnicastIPAddressInformation address)
                    {
                        return address.Address.AddressFamily == AddressFamily.InterNetwork &&
                            !IPAddress.IsLoopback(address.Address) &&
                            !address.Address.ToString().StartsWith("169.254.", StringComparison.Ordinal);
                    })
                    .Select(delegate(UnicastIPAddressInformation address) { return address.Address; });

                IPAddress preferred = addresses.FirstOrDefault(delegate(IPAddress address)
                {
                    string value = address.ToString();
                    return value.StartsWith("192.168.", StringComparison.Ordinal) ||
                        value.StartsWith("10.", StringComparison.Ordinal) ||
                        Regex.IsMatch(value, @"^172\.(1[6-9]|2[0-9]|3[01])\.");
                });

                return (preferred ?? addresses.FirstOrDefault() ?? IPAddress.Loopback).ToString();
            }
            catch
            {
                return IPAddress.Loopback.ToString();
            }
        }

        private static string BuildInviteUrl(string host, int port, string token)
        {
            return "http://" + host + ":" + port + "/?editorToken=" + Uri.EscapeDataString(token);
        }

        private void AppendDiagnostic(StringBuilder target, string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return;
            }

            lock (_diagnosticsLock)
            {
                target.AppendLine(line.Trim());
                if (target.Length > 8000)
                {
                    target.Remove(0, target.Length - 6000);
                }
            }
        }

        private string GetDiagnosticTail(StringBuilder source)
        {
            lock (_diagnosticsLock)
            {
                string value = source.ToString().Trim();
                if (value.Length == 0)
                {
                    return string.Empty;
                }

                if (value.Length > 400)
                {
                    value = value.Substring(value.Length - 400);
                }
                return "\r\n" + value;
            }
        }

        private void SetHostStatus(string message, Color color)
        {
            if (_hostStatusLabel == null || _hostStatusLabel.IsDisposed)
            {
                return;
            }

            _hostStatusLabel.ForeColor = color;
            _hostStatusLabel.Text = message;
        }

        private static void OpenBrowser(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return;
            }

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = url;
                startInfo.UseShellExecute = true;
                Process.Start(startInfo);
            }
            catch (Exception exception)
            {
                MessageBox.Show(
                    "No se pudo abrir el navegador. Copia la URL manualmente.\r\n\r\n" + exception.Message,
                    "Pokémon Adventure",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        private void CopyText(string value, string successMessage)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return;
            }

            try
            {
                Clipboard.SetText(value);
                SetHostStatus(successMessage, SuccessColor);
            }
            catch (Exception exception)
            {
                SetHostStatus("No se pudo copiar: " + exception.Message, ErrorColor);
            }
        }

        private static string Quote(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static TableLayoutPanel CreateContentLayout(int rows)
        {
            TableLayoutPanel layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill;
            layout.ColumnCount = 1;
            layout.RowCount = rows;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            layout.Margin = new Padding(0);
            return layout;
        }

        private static Label CreateHeading(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = true;
            label.Font = new Font("Segoe UI", 17F, FontStyle.Bold, GraphicsUnit.Point);
            label.ForeColor = TextColor;
            label.Margin = new Padding(0, 0, 0, 6);
            return label;
        }

        private static Label CreateDescription(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = true;
            label.MaximumSize = new Size(660, 0);
            label.Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
            label.ForeColor = MutedColor;
            label.Margin = new Padding(0, 0, 0, 8);
            return label;
        }

        private static Label CreateFieldLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = true;
            label.Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
            label.ForeColor = MutedColor;
            label.Margin = new Padding(0, 7, 0, 5);
            return label;
        }

        private static Button CreateLargeButton(string title, string description, Color background, Color foreground)
        {
            Button button = new Button();
            button.Text = title + "\r\n" + description;
            button.Dock = DockStyle.Fill;
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = background;
            button.ForeColor = foreground;
            button.Font = new Font("Segoe UI", 13F, FontStyle.Bold, GraphicsUnit.Point);
            button.Cursor = Cursors.Hand;
            button.Margin = new Padding(0, 4, 0, 8);
            button.Padding = new Padding(8);
            return button;
        }

        private static Button CreateButton(string text, Color background, Color foreground)
        {
            Button button = new Button();
            button.Text = text;
            button.AutoSize = true;
            button.MinimumSize = new Size(122, 40);
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.BackColor = background;
            button.ForeColor = foreground;
            button.Font = new Font("Segoe UI", 10F, FontStyle.Bold, GraphicsUnit.Point);
            button.Cursor = Cursors.Hand;
            button.Margin = new Padding(0, 0, 9, 0);
            button.Padding = new Padding(10, 4, 10, 4);
            return button;
        }

        private static TextBox CreateTextBox(bool readOnly)
        {
            TextBox textBox = new TextBox();
            textBox.Dock = DockStyle.Fill;
            textBox.ReadOnly = readOnly;
            textBox.BorderStyle = BorderStyle.FixedSingle;
            textBox.BackColor = Color.FromArgb(17, 24, 39);
            textBox.ForeColor = TextColor;
            textBox.Font = new Font("Consolas", 9.5F, FontStyle.Regular, GraphicsUnit.Point);
            textBox.Margin = new Padding(0);
            return textBox;
        }

        private static TableLayoutPanel CreateCopyRow(out TextBox textBox, out Button copyButton, string buttonText)
        {
            TableLayoutPanel row = new TableLayoutPanel();
            row.Dock = DockStyle.Fill;
            row.ColumnCount = 2;
            row.RowCount = 1;
            row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            row.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            row.Margin = new Padding(0);

            textBox = CreateTextBox(true);
            textBox.Margin = new Padding(0, 0, 10, 0);
            row.Controls.Add(textBox, 0, 0);

            copyButton = CreateButton(buttonText, SecondaryColor, Color.White);
            copyButton.Margin = new Padding(0);
            copyButton.Dock = DockStyle.Fill;
            row.Controls.Add(copyButton, 1, 0);
            return row;
        }
    }
}
