package p2p;

import p2p.controller.FileController;

public class App {
    public static void main(String[] args) {
       try{
          FileController fileController = new FileController(8080);
          fileController.start();
          System.out.println("PeerLink server started at port 8080");
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
