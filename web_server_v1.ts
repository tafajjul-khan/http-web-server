import * as net from "net";
// console.log(net);

function newConn(socket: net.Socket): void {
  console.log("new connection", socket.remoteAddress, socket.remotePort);
  //
  socket.on("end", () => {
    // FIN recevied the connection will be closed automaically
    console.log("EOF");
  });
  socket.on("data", (data: Buffer) => {
    console.log("data", data);
    socket.write(data); // echo back the data

    if (data.includes("q")) {
      console.log("closing");
      socket.end(); // this will send FIN and Close the connection
    }
  });
}
let server = net.createServer();
server.on("connection", newConn);
server.on("error", (err: Error) => {
  throw err;
});

server.listen({ host: "127.0.0.2", port: 1234 });
