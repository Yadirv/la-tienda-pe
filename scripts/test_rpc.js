const url = "https://qkzhopjfrlyvqfievcfi.supabase.co/rest/v1/rpc/fn_crear_pedido";
const key = "sb_publishable_B8kxChkEQRWA32IFAWNLXA_viGXj1Yo"; 

async function testRpc() {
  const payload = {
      p_payload: {
          municipio: "Medellín",
          direccion_b2c: "Calle 10",
          nombre_b2c: "Test",
          celular: 12345,
          items: [{ ref: "USA627 IN", qty: 1, nombre: "INABA CAT" }],
          detalles_json: { test: true }
      }
  };
  
  const res = await fetch(url, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify(payload)
  });
  
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
testRpc();
