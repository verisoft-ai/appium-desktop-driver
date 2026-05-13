using Microsoft.Web.WebView2.WinForms;
using System.Windows.Forms;

public class MainForm : Form
{
    private WebView2 webView;
    private Label statusLabel;

    public MainForm()
    {
        Text = "WebView2TestApp";
        Width = 1024;
        Height = 768;

        statusLabel = new Label
        {
            Name = "StatusLabel",
            AccessibleName = "StatusLabel",
            Text = "Initializing...",
            Dock = DockStyle.Bottom,
            Height = 30,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(4, 0, 0, 0),
        };

        webView = new WebView2 { Dock = DockStyle.Fill };
        webView.NavigationCompleted += (_, _) => statusLabel.Text = "Ready";

        Controls.Add(webView);
        Controls.Add(statusLabel);

        Load += MainForm_Load;
    }

    private async void MainForm_Load(object? sender, EventArgs e)
    {
        await webView.EnsureCoreWebView2Async(null);
        webView.Source = new Uri("https://example.com");
    }
}
