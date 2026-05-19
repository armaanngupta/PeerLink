package p2p;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import p2p.controller.FileController;

public class App {
    private static final Logger logger = LoggerFactory.getLogger(App.class);

    public static void main(String[] args) {
        try {
            int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
            FileController fileController = new FileController(port);
            fileController.start();
            logger.info("PeerLink server started on port {}", port);
            logger.info("UI available at http://localhost:3000");

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                logger.info("Shutting down PeerLink server...");
                fileController.stop();
            }, "shutdown-hook"));

        } catch (Exception e) {
            logger.error("Failed to start PeerLink server", e);
            System.exit(1);
        }
    }
}
