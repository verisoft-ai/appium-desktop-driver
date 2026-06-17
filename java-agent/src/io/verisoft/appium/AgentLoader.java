package io.verisoft.appium;

/**
 * Dynamically injects appium-desktop-agent.jar into a running JVM using the Java Attach API.
 * Uses reflection so this class compiles without tools.jar on the classpath.
 * At runtime, com.sun.tools.attach.VirtualMachine must be reachable:
 *   Java 8 JDK: pass $JAVA_HOME/lib/tools.jar on the -cp
 *   Java 9+:    pass --add-modules jdk.attach
 */
public class AgentLoader {

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: AgentLoader <pid> <agent-jar>");
            System.exit(1);
        }
        String pid = args[0];
        String agentJar = args[1];

        Class<?> vmClass = Class.forName("com.sun.tools.attach.VirtualMachine");
        Object vm = vmClass.getMethod("attach", String.class).invoke(null, pid);
        try {
            vmClass.getMethod("loadAgent", String.class).invoke(vm, agentJar);
        } catch (java.lang.reflect.InvocationTargetException e) {
            Throwable cause = e.getCause();
            // Java 8 on Windows: readInt() doesn't strip \r from \r\n responses, so
            // Integer.parseInt("0\r") throws even when the agent loaded successfully.
            // Verify by waiting for the agent's port file before giving up.
            if (cause instanceof java.io.IOException
                    && cause.getMessage() != null
                    && cause.getMessage().contains("Non-numeric")) {
                String portFile = System.getProperty("java.io.tmpdir")
                        + java.io.File.separator + "appium-agent-" + pid + ".port";
                long deadline = System.currentTimeMillis() + 5000;
                while (System.currentTimeMillis() < deadline) {
                    if (new java.io.File(portFile).exists()) {
                        return; // agent loaded fine — Java 8 false-negative
                    }
                    Thread.sleep(200);
                }
                System.err.println("[AgentLoader] Java 8 attach: port file not found after 5s — agent did not load.");
                System.exit(1);
            }
            throw e;
        } finally {
            vmClass.getMethod("detach").invoke(vm);
        }
    }
}
