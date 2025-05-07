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

// Interface for the full database item (already includes all fields)
export interface DatabaseItem {
  id: number;
  name: string;
  version?: string | null;
  display_name?: string | null;
  short_name_id?: string | null;
  search_id?: string | null;
  description?: string | null;
  documentation?: string | null;
  organization_id?: string | null;
  repository_owner?: string | null;
  repository_name?: string | null;
  github_url?: string | null;
  raw_code?: string | null;
  embedding?: number[] | null; // Note: embedding can be large, consider if needed for list view
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
}

// Updated to fetch only summarized data
export async function fetchInitialDatabaseItems(): Promise<DatabaseListItem[]> {
  try {
    console.log('Server Action (actions.ts): Fetching initial summarized database items...');
    // Select only id, name, and created_at for the list view 
    const result = await pool.query<DatabaseListItem>(
      "SELECT id, name, version, created_at FROM code_examples ORDER BY id ASC"
    );
    console.log(`Server Action (actions.ts): Fetched ${result.rows.length} summarized items.`);
    return result.rows.map(row => ({
      ...row,
      created_at: row.created_at ? new Date(row.created_at) : null,
    }));
  } catch (error) {
    console.error('Server Action Error (actions.ts - fetchInitialDatabaseItems):', error);
    return [];
  }
}

// New server action to fetch a single full database item by ID
export async function fetchFullDatabaseItemById(id: number): Promise<DatabaseItem | null> {
  try {
    console.log(`Server Action (actions.ts): Fetching full database item by ID: ${id}...`);
    const result = await pool.query<DatabaseItem>(
      "SELECT * FROM code_examples WHERE id = $1",
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
    console.log(`Server Action (actions.ts): No item found with ID: ${id}.`);
    return null;
  } catch (error) {
    console.error(`Server Action Error (actions.ts - fetchFullDatabaseItemById for ID ${id}):`, error);
    return null;
  }
}

export async function performSemanticSearch(args: SemanticSearchArgs): Promise<DatabaseItem[]> {
  const { embedding, limit = 3, version } = args; // <--- Destructure version
  try {
    console.log(`Server Action (actions.ts): Performing semantic search for version: ${version || 'any'}...`);
    if (!embedding || embedding.length === 0) {
      console.warn('Server Action (actions.ts - performSemanticSearch): No embedding provided.');
      return [];
    }

    const embeddingString = `[${embedding.join(',')}]`;
    
    let queryText = `
      SELECT * FROM code_examples
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
    
    console.log(`Server Action (actions.ts): Semantic search found ${result.rows.length} items.`);
    return result.rows.map(item => ({
      ...item,
      created_at: item.created_at ? new Date(item.created_at) : null,
    }));
  } catch (error) {
    console.error('Server Action Error (actions.ts - performSemanticSearch):', error);
    return [];
  }
}