package io.verisoft.appium;

import java.io.*;
import java.lang.instrument.Instrumentation;
import java.lang.management.ManagementFactory;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;

public class AppiumDesktopAgent {

    public static void premain(String agentArgs, Instrumentation inst) {
        try {
            ServerSocket serverSocket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
            int port = serverSocket.getLocalPort();

            String pid = ManagementFactory.getRuntimeMXBean().getName().split("@")[0];

            File portFile = new File(System.getProperty("java.io.tmpdir"), "appium-agent-" + pid + ".port");
            try (FileWriter fw = new FileWriter(portFile)) {
                fw.write(port + "\n");
            }
            portFile.deleteOnExit();

            ComponentRegistry registry = new ComponentRegistry(pid);

            Thread serverThread = new Thread(() -> {
                while (!serverSocket.isClosed()) {
                    try {
                        Socket client = serverSocket.accept();
                        Thread t = new Thread(() -> handleClient(client, registry), "appium-agent-client");
                        t.setDaemon(true);
                        t.start();
                    } catch (IOException e) {
                        if (!serverSocket.isClosed()) {
                            System.err.println("[AppiumAgent] Accept error: " + e.getMessage());
                        }
                    }
                }
            }, "appium-agent-server");
            serverThread.setDaemon(true);
            serverThread.start();

            System.err.println("[AppiumAgent] Ready on port=" + port + " pid=" + pid);

        } catch (Exception e) {
            System.err.println("[AppiumAgent] Startup failed: " + e.getMessage());
        }
    }

    private static void handleClient(Socket socket, ComponentRegistry registry) {
        try (BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), "UTF-8"));
             PrintWriter out = new PrintWriter(new OutputStreamWriter(socket.getOutputStream(), "UTF-8"), true)) {
            String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) {
                String response = CommandHandler.handle(line.trim(), registry);
                out.println(response);
            }
        } catch (IOException e) {
            System.err.println("[AppiumAgent] Client error: " + e.getMessage());
        }
    }
}
