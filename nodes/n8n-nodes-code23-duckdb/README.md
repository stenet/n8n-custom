# n8n-nodes-code23-duckdb

A custom n8n node for executing SQL queries on [DuckDB](https://duckdb.org), an in-process SQL OLAP database.

## Features

- **Execute SQL Queries**: Run SQL queries against DuckDB databases
- **Connection Pooling**: Efficient connection management for better performance
- **Type Safety**: Full TypeScript support with proper type definitions
- **Flexible Input**: Support for parameterized queries and dynamic SQL generation
- **n8n Integration**: Seamless integration with n8n workflows as an input node

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher
- [npm](https://www.npmjs.com/)
- [git](https://git-scm.com/)

## ⚠️ Important: Docker Configuration

**This node is NOT compatible with the default n8n Docker image!**

The default n8n Docker container is based on Alpine Linux, which is incompatible with DuckDB. Installing this node in an Alpine-based container will **destroy the container**.

### Solution

You **must** use a Debian-based Docker image for n8n. See the included `Dockerfile` in this repository as an example of a working Debian-based setup:

```dockerfile
FROM node:22-bookworm-slim
# ... rest of configuration
```

To use this node with n8n in Docker:
1. Build a custom Docker image using the provided `Dockerfile` or create your own based on `node:22-bookworm-slim` or similar Debian variant
2. Include system dependencies required for building native modules (python3, build-essential, etc.)
3. Install n8n and the DuckDB node in the custom image

## Installation

Clone the repository:

```bash
git clone https://github.com/stenet/n8n-nodes-code23-duckdb.git
cd n8n-nodes-code23-duckdb
```

Install dependencies:

```bash
npm install
```

## Development

Start n8n with the node loaded and watch for changes:

```bash
npm run dev
```

This will:
- Start n8n locally (usually at http://localhost:5678)
- Load your DuckDB node
- Enable hot reload for development changes

### Available Commands

| Command           | Description                                  |
| --------------- | -------------------------------------------- |
| `npm run dev`     | Start n8n with watch mode                   |
| `npm run build`   | Build the node for production               |
| `npm run lint`    | Check code for linting issues               |
| `npm run lint:fix`| Automatically fix linting issues            |

## Usage

### Adding the Node to a Workflow

1. Open n8n and create a new workflow
2. Click the plus icon to add a node
3. Search for "DuckDB"
4. Select the DuckDB node

### Configuration

1. **Credentials**: Set up DuckDB API credentials (database file path or connection string)
2. **Operation**: Select "Execute SQL"
3. **SQL Query**: Enter your SQL query

### Example

```sql
SELECT * FROM table_name WHERE column = $1
```

## Project Structure

```
├── nodes/
│   └── DuckDB/
│       ├── DuckDb.node.ts          # Main node class
│       ├── DuckDB.node.json        # Node metadata
│       ├── resources/
│       │   └── executeSQL/          # SQL execution operation
│       └── shared/                  # Shared utilities
├── credentials/
│   └── DuckDbApi.credentials.ts    # DuckDB credentials
├── icons/                           # Node icons
└── package.json
```

## Building and Publishing

### Build for Production

```bash
npm run build
```

This compiles TypeScript and outputs to the `dist/` directory.

### Publish to npm

```bash
npm publish
```

Before publishing, ensure:
- Version in `package.json` is updated
- Changes are committed to git
- All tests pass and code is linted

## Troubleshooting

### Node not appearing in n8n

1. Ensure dependencies are installed: `npm install`
2. Verify the node is registered in `package.json` under `n8n.nodes`
3. Restart the dev server: `npm run dev`
4. Check browser console for error messages

### Connection Issues

- Verify DuckDB credentials are correctly configured
- Check that the database file path or connection string is accessible
- Review n8n logs for detailed error messages

### Linting Errors

Run `npm run lint:fix` to automatically fix most issues.

## Resources

- [DuckDB Documentation](https://duckdb.org/docs/)
- [n8n Node Development Guide](https://docs.n8n.io/integrations/creating-nodes/)
- [n8n Community Forum](https://community.n8n.io/)
- [@n8n/node-cli Documentation](https://www.npmjs.com/package/@n8n/node-cli)

## Author

Stefan Heim - [stefan.heim@hotmail.com](mailto:stefan.heim@hotmail.com)

## License

[MIT](LICENSE.md)