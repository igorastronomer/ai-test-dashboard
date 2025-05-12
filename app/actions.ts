"use server";

import { Pool } from 'pg';

// Database connection pool
// Credentials should ideally be environment variables in a real application
const pool = new Pool({
  user: 'neondb_owner',
  host: 'ep-icy-dew-a4g1lqh1-pooler.us-east-1.aws.neon.tech',
  database: 'neondb',
  password: 'npg_TvzCxf01LVdn', // WARNING: Hardcoding credentials is a major security risk.
  port: 5432,
  ssl: {
    rejectUnauthorized: false, // Adjust based on your Neon SSL requirements
  },
});

// Optional: Test connection (will log on the server during startup/first use)
pool.connect()
  .then(() => console.log('Successfully connected to PostgreSQL database via pg pool (from actions.ts).'))
  .catch(err => console.error('Error connecting to PostgreSQL database (from actions.ts):', err.stack));

// Define available tables as a constant (not exported)
const DATABASE_TABLES = {
  CODE_EXAMPLES: 'code_examples',
  AIRFLOW_CODE_EMBEDDINGS: 'airflow_code_embeddings'
};

// Export an async function to get the table names
export async function getDatabaseTables() {
  return {
    CODE_EXAMPLES: DATABASE_TABLES.CODE_EXAMPLES,
    AIRFLOW_CODE_EMBEDDINGS: DATABASE_TABLES.AIRFLOW_CODE_EMBEDDINGS
  };
}

// Interface for the full database item (already includes all fields)
export interface DatabaseItem {
  id: number;
  version: string;
  release_date?: string | null;
  runtime_versions?: string | null;
  name?: string | null;
  file_path?: string | null;
  content?: string | null;
  embedding?: number[] | null;
  created_at?: Date | null;
}

// New interface for the summarized list item
export interface DatabaseListItem {
  id: number;
  name: string;
  version?: string | null;
  created_at?: Date | null;
}

export interface SemanticSearchArgs {
  embedding: number[];
  queryText: string;
  limit?: number;
  version?: string | null;
  tableName?: string; // New parameter for table selection
}

// Updated to fetch only summarized data with table selection
export async function fetchInitialDatabaseItems(tableName: string = DATABASE_TABLES.CODE_EXAMPLES): Promise<DatabaseListItem[]> {
  try {
    console.log(`Server Action (actions.ts): Fetching initial summarized database items from ${tableName}...`);
    // Select only id, name, and created_at for the list view
    // For airflow_code_embeddings, we'll use content as the name if name is not available
    let query = '';
    
    if (tableName === DATABASE_TABLES.AIRFLOW_CODE_EMBEDDINGS) {
      query = `SELECT id, COALESCE(name, LEFT(content, 50)) as name, version, created_at FROM "${tableName}" ORDER BY id ASC`;
    } else {
      query = `SELECT id, name, version, created_at FROM "${tableName}" ORDER BY id ASC`;
    }
    
    const result = await pool.query<DatabaseListItem>(query);
    console.log(`Server Action (actions.ts): Fetched ${result.rows.length} summarized items from ${tableName}.`);
    return result.rows.map(row => ({
      ...row,
      created_at: row.created_at ? new Date(row.created_at) : null,
    }));
  } catch (error) {
    console.error(`Server Action Error (actions.ts - fetchInitialDatabaseItems from ${tableName}):`, error);
    return [];
  }
}

// Updated server action to fetch a single full database item by ID with table selection
export async function fetchFullDatabaseItemById(id: number, tableName: string = DATABASE_TABLES.CODE_EXAMPLES): Promise<DatabaseItem | null> {
  try {
    console.log(`Server Action (actions.ts): Fetching full database item by ID: ${id} from ${tableName}...`);
    const result = await pool.query<DatabaseItem>(
      `SELECT * FROM "${tableName}" WHERE id = $1`,
      [id]
    );
    if (result.rows.length > 0) {
      const item = result.rows[0];
      // Ensure date fields are correctly formatted if necessary
      return {
        ...item,
        created_at: item.created_at ? new Date(item.created_at) : null,
      };
    }
    console.log(`Server Action (actions.ts): No item found with ID: ${id} in ${tableName}.`);
    return null;
  } catch (error) {
    console.error(`Server Action Error (actions.ts - fetchFullDatabaseItemById for ID ${id} from ${tableName}):`, error);
    return null;
  }
}

export async function performSemanticSearch(args: SemanticSearchArgs): Promise<DatabaseItem[]> {
  const { embedding, limit = 5, version, tableName = DATABASE_TABLES.CODE_EXAMPLES } = args;
  try {
    console.log(`Server Action (actions.ts): Performing semantic search in ${tableName} for version: ${version || 'any'}...`);
    if (!embedding || embedding.length === 0) {
      console.warn(`Server Action (actions.ts - performSemanticSearch in ${tableName}): No embedding provided.`);
      return [];
    }

    const embeddingString = `[${embedding.join(',')}]`;
    
    let queryText = `
      SELECT * FROM "${tableName}"
    `;
    
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Add WHERE clause for version if provided
    if (version && version.trim() !== "") {
      queryText += ` WHERE version = $${paramIndex}`;
      queryParams.push(version);
      paramIndex++;
    }
    
    // Add ORDER BY for semantic similarity
    queryText += ` ORDER BY embedding <=> $${paramIndex}::vector`;
    queryParams.push(embeddingString);
    paramIndex++;
    
    // Add LIMIT
    queryText += ` LIMIT $${paramIndex};`;
    queryParams.push(limit);

    console.log("Executing query:", queryText);
    console.log("With params:", queryParams);

    const result = await pool.query<Omit<DatabaseItem, 'embedding'>>(queryText, queryParams); // Omit embedding as we are not selecting it
    
    console.log(`Server Action (actions.ts): Semantic search found ${result.rows.length} items in ${tableName}.`);
    return result.rows.map(item => ({
      ...item,
      created_at: item.created_at ? new Date(item.created_at) : null,
    }));
  } catch (error) {
    console.error(`Server Action Error (actions.ts - performSemanticSearch in ${tableName}):`, error);
    return [];
  }
}