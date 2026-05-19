package p2p;

import p2p.controller.FileController;

public class App {
    public static void main(String[] args) {
       try{
          int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
          FileController fileController = new FileController(port);
          fileController.start();
          System.out.println("PeerLink server started at port " + port);
          System.out.println("UI available at http://localhost:3000");
          Runtime.getRuntime().addShutdownHook(
             new Thread(
                     () -> {
                        System.out.println("Shutting down the server");
                        fileController.stop();
                     }
             )
          );
       }catch (Exception e){
          System.out.println("Failed to start the server on port 8088");
          e.printStackTrace();
       }
    }
}
