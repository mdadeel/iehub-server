import dns from 'dns';

const domain = '_mongodb._tcp.cluster0.pzwiytu.mongodb.net';

console.log(`Resolving SRV for: ${domain}`);

dns.resolveSrv(domain, (err, addresses) => {
    if (err) {
        console.error('DNS Resolution Error:', err);
    } else {
        console.log('SRV Records found:', addresses);
    }
});
