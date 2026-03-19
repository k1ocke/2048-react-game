const styleMock = new Proxy({}, { get: (_target, prop) => String(prop) });
export default styleMock;
