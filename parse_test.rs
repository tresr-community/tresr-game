fn main() {
    let msg = "localhost:4321 wants you to sign in with your Ethereum account:\n0xb81749C72DB5B5209098f2bd45A7a0293925DA13\n\nURI: http://localhost:4321\nVersion: 1\nChain ID: 31337\nNonce: 123456\nIssued At: 2024-03-22T12:00:00.000Z";

    let mut address = None;
    let mut issued_at = None;

    for line in msg.lines() {
        if line.starts_with("0x") && line.len() == 42 {
            address = Some(line.trim());
        } else if line.starts_with("Issued At: ") {
            issued_at = Some(line.strip_prefix("Issued At: ").unwrap().trim());
        }
    }
    println!("Address: {:?}", address);
    println!("Issued At: {:?}", issued_at);
}
