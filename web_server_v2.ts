
import * as net from "net";

type TCPConn = {
  // the socket object
  socket: net.Socket;
  // from the "error" event
  err: null | Error;
  // EOF from the 'end' event
  ended: boolean;
  // the callback of the promise of the current read
  reader: null | {
    resolve: (value: Buffer) => void;
    reject: (reason: Error) => void;
  };
};

function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    err: null,
    ended: false,
    reader: null,
  };
  socket.on("data", (data: Buffer) => {
    if (!conn.reader) return;
    // pause the "data" event until the next read
    conn.socket.pause();
    // fulfill the promise of the current read
    conn.reader.resolve(data);
    conn.reader = null;
  });
  socket.on("end", () => {
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from("")); // EOF
      conn.reader = null;
    }
  });
  socket.on("error", (err: Error) => {
    // errors are also delivered to the current read
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });
  return conn;
}

// returns an empty "buffers" after EOF

function soRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader); // no concurrent calls
  return new Promise((resolve, reject) => {
    if(conn.err){
        reject(conn.err);
        return;
    }
    if(conn.ended){
        resolve(Buffer.from('')) // eof
        return;
    }
    // save the promise callbacks
    conn.reader = { resolve: resolve, reject: reject };
    // and resume the 'data' event to fulfill the promise later
    conn.socket.resume();
  });
}

function soWrite(conn:TCPConn , data:Buffer):Promise<void>{
    console.assert(data.length > 0);
    return new Promise((resolve,reject) => {
        if(conn.err) {
            reject(conn.err);
            return
        }
         conn.socket.write(data, (err?: Error | null) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    })
}

async function newConn(socket: net.Socket): Promise<void> {
    console.log('new connection', socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
    } catch (exc) {
        console.error('exception:', exc);
    } finally {
        socket.destroy();
    }
}
async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = soInit(socket);
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0) {
            console.log('end connection');
            break;
        }

        console.log('data', data);
        await soWrite(conn, data);
    }
}

const server = net.createServer({
  pauseOnConnect: true, // required TCPConn
});

server.on('connection', newConn); 
server.listen({host: '127.0.0.1', port: 1234}, () => {
    console.log('Server chalu ho gaya: 127.0.0.1:1234');
});