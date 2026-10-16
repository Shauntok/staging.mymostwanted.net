import net from "node:net";

const parsedPort=Number(process.env.MMWR_TEST_CLAMD_PORT??"3310");
if(!Number.isInteger(parsedPort)||parsedPort<1||parsedPort>65_535)throw new Error("MMWR_TEST_CLAMD_PORT must be a valid TCP port.");

function pingClamd(port){
  return new Promise(resolve=>{
    const socket=net.createConnection({host:"127.0.0.1",port});
    let settled=false;
    let response=Buffer.alloc(0);
    const finish=ready=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(ready);
    };
    const timeout=setTimeout(()=>finish(false),2_000);
    socket.once("connect",()=>socket.write(Buffer.from("zPING\0")));
    socket.on("data",chunk=>{
      response=Buffer.concat([response,chunk]);
      if(response.length>64){finish(false);return;}
      if(response.includes(0)||response.includes(10))finish(response.toString("utf8").replace(/[\0\r\n]/g,"")==="PONG");
    });
    socket.once("error",()=>finish(false));
    socket.once("close",()=>finish(false));
  });
}

const deadline=Date.now()+10*60*1000;
while(Date.now()<deadline){
  if(await pingClamd(parsedPort)){
    process.stdout.write(`ClamAV daemon ready on 127.0.0.1:${parsedPort}.\n`);
    process.exitCode=0;
    break;
  }
  await new Promise(resolve=>setTimeout(resolve,5_000));
}

if(Date.now()>=deadline)throw new Error("ClamAV daemon did not become ready within 10 minutes.");
