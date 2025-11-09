package p2p.service;

import p2p.utils.UploadUtils;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;

public class Filesharer {

   private HashMap<Integer, String> availableFiles;

   public Filesharer() {
      availableFiles = new HashMap<>();
   }

   public int offerFile(String filePath)  {
      int port;
      while(true) {
         port = UploadUtils.generateCode();
         if(!availableFiles.containsKey(port)) {
            availableFiles.put(port, filePath);
            return port;
         }
      }
   }

   public void startFileServer(int port) {
      String filePath = availableFiles.get(port);
      if(filePath == null) {
         System.out.println("No file is associated with port " + port);
         return;
      }

      try(ServerSocket serverSocket = new ServerSocket(port)) {
         System.out.println("Serving file " + new File(filePath).getName() + " on port " + port);
         Socket clientSocket = serverSocket.accept();     // blocking call, waits until a client connects.
         System.out.println("Client connection: " + clientSocket.getInetAddress());
         new Thread(new FileSenderHandler(clientSocket, filePath)).start();
      }catch(IOException ex) {
         System.out.println("Error handling file server on port: " + port);
      }

   }
      //because the ServerSocket is inside try-with-resources
      //and we call accept() only once, the server accepts exactly one client, then stops listening.
      //If it is to serve multiple clients, that won’t happen.

   private static class FileSenderHandler implements Runnable {

      private final Socket clientSocket;
      private final String filePath;

      public FileSenderHandler(Socket clientSocket, String filePath) {
         this.clientSocket = clientSocket;
         this.filePath = filePath;
      }

      @Override
      public void run () {
         try(FileInputStream fis = new FileInputStream(filePath)) {
            OutputStream oos = clientSocket.getOutputStream();
            String fileName = new File(filePath).getName();
            String header = "Filename: " + fileName + "\n";
            oos.write(header.getBytes());

            byte[] buffer = new byte[4096];
            int byteRead;
            while((byteRead = fis.read(buffer)) != -1){
               oos.write(buffer, 0, byteRead);
            }
            System.out.println("File " + fileName + " sent to " + clientSocket.getInetAddress());
         }catch(Exception ex) {
            System.out.println("Error while sending file to the client " + ex.getMessage());
         }finally{
            try {
               clientSocket.close();
            }catch (Exception ex) {
               System.out.println("Error while closing the socket: " + ex.getMessage());
            }
         }
      }
   }
}
