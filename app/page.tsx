'use client';

import React, { useState, FormEvent, useMemo, useCallback, useEffect } from 'react';
import { AzureOpenAI } from 'openai';
// Removed Pool import from 'pg' as it's now in actions.ts

// Import Server Actions and types from actions.ts
import {
  fetchInitialDatabaseItems,
  performSemanticSearch,
  fetchFullDatabaseItemById, // New action
  type DatabaseItem,
  type DatabaseListItem, // New type for list view
  getDatabaseTables // Import the async function instead of the constant
} from './actions';

// Define a new type for items that will be displayed as suggestions, including a similarity score
type DisplaySuggestionItem = DatabaseItem & { 
  similarityScore?: number;
  // No need to redefine properties that already exist in DatabaseItem
};

// All database pool, connection logic, DatabaseItem, SemanticSearchArgs,
// fetchInitialDatabaseItems, and performSemanticSearch functions have been moved to app/actions.ts

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  suggestions?: DisplaySuggestionItem[]; // Use the new type here
}

const CHAT_MESSAGES_STORAGE_KEY = 'chatMessages';

export default function Home() {
  const [items, setItems] = useState<DatabaseListItem[]>([]); // Holds summarized items for the list
  const [selectedItem, setSelectedItem] = useState<DatabaseItem | null>(null); // Holds the full details of the selected item
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoadingAiResponse, setIsLoadingAiResponse] = useState(false);
// 1. Add this array at the top of your component (after useState, before return)
const airflowVersions = [
  "3.0.0",
  // 2.x series (2020-2025)
  "2.10.5", "2.10.4", "2.10.3", "2.10.2", "2.10.1", "2.10.0",
  "2.9.3", "2.9.2", "2.9.1", "2.9.0",
  "2.8.1", "2.8.0",
  "2.7.3", "2.7.2", "2.7.1", "2.7.0",
  "2.6.3", "2.6.2", "2.6.1", "2.6.0",
  "2.5.3", "2.5.2", "2.5.1", "2.5.0",
  "2.4.3", "2.4.2", "2.4.1", "2.4.0",
  "2.3.4", "2.3.3", "2.3.2", "2.3.1", "2.3.0",
  "2.2.5", "2.2.4", "2.2.3", "2.2.2", "2.2.1", "2.2.0",
  "2.1.4", "2.1.3", "2.1.2", "2.1.1", "2.1.0",
  "2.0.2", "2.0.1", "2.0.0",
  // 1.x series (2016-2020)
  "1.10.15", "1.10.14", "1.10.13", "1.10.12", "1.10.11", "1.10.10", "1.10.9", "1.10.8", "1.10.7", "1.10.6", "1.10.5", "1.10.4", "1.10.3", "1.10.2", "1.10.1", "1.10.0",
  "1.9.0",
  "1.8.2", "1.8.1", "1.8.0",
  "1.7.1.2", "1.7.1.1", "1.7.1", "1.7.0",
  "1.6.3", "1.6.2", "1.6.1", "1.6.0",
  "1.5.3", "1.5.2", "1.5.1", "1.5.0",
  "1.4.3", "1.4.2", "1.4.1", "1.4.0",
  "1.3.0",
  "1.2.2", "1.2.1", "1.2.0",
  "1.1.2", "1.1.1", "1.1.0",
  "1.0.2", "1.0.1", "1.0.0"
];

  // Use localStorage key for version
  const VERSION_STORAGE_KEY = 'selectedAirflowVersion';
  
  // Add a state to track if we're on the client side
  const [isClient, setIsClient] = useState(false);

  const [version, setVersion] = useState('3.0.0');

  useEffect(() => {
    // Set isClient to true once component mounts (client-side only)
    setIsClient(true);
    
    const stored = localStorage.getItem(VERSION_STORAGE_KEY);
    if (stored) setVersion(stored);
  }, []);

  // 2. Add these states
  const [versionInput, setVersionInput] = useState(version);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);

  // Store version in localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && version) {
      localStorage.setItem(VERSION_STORAGE_KEY, version);
    }
  }, [version]);

  // 3. Filtered suggestions
  const filteredVersions = useMemo(
    () =>
      airflowVersions.filter(v =>
        v.startsWith(versionInput)
      ),
    [versionInput]
  );

  const [isLoadingItems, setIsLoadingItems] = useState(true); // For initial list load
  const [fetchItemsError, setFetchItemsError] = useState<string | null>(null);
  const [isLoadingSelectedItemDetails, setIsLoadingSelectedItemDetails] = useState(false);
  const [fetchSelectedItemError, setFetchSelectedItemError] = useState<string | null>(null);

  // Add state for available tables
  const [databaseTables, setDatabaseTables] = useState<{
    CODE_EXAMPLES: string;
    AIRFLOW_CODE_EMBEDDINGS: string;
  } | null>(null);
  
  // Add state for selected table
  const TABLE_STORAGE_KEY = 'selectedDatabaseTable';
  const [selectedTable, setSelectedTable] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(TABLE_STORAGE_KEY);
      return stored || 'code_examples'; // Default to code_examples
    }
    return 'code_examples';
  });

  // Fetch available tables on component mount
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const tables = await getDatabaseTables();
        setDatabaseTables(tables);
        
        // If the stored table doesn't exist in the returned tables, reset to default
        if (selectedTable && tables) {
          const tableValues = Object.values(tables);
          if (!tableValues.includes(selectedTable)) {
            setSelectedTable(tables.CODE_EXAMPLES);
          }
        }
      } catch (error) {
        console.error('Error fetching database tables:', error);
      }
    };
    
    fetchTables();
  }, [selectedTable]);

  // Store table selection in localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedTable) {
      localStorage.setItem(TABLE_STORAGE_KEY, selectedTable);
    }
  }, [selectedTable]);

  // Effect to load messages from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedMessages = localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY);
      if (storedMessages) {
        try {
          const parsedMessages = JSON.parse(storedMessages);
          if (Array.isArray(parsedMessages)) {
            setMessages(parsedMessages);
            console.log('Chat history loaded from localStorage on mount.');
          }
        } catch (error) {
          console.error('Error parsing messages from localStorage on mount:', error);
          localStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY); // Clear corrupted data
        }
      }
    }
  }, []);

  // Effect to save messages to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (messages.length > 0) {
        localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(messages));
        console.log('Chat history saved to localStorage.');
      } else {
        if (localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY)) {
          localStorage.removeItem(CHAT_MESSAGES_STORAGE_KEY);
          console.log('Chat history cleared from localStorage.');
        }
      }
    }
  }, [messages]);

  // Effect to load initial summarized database items - update to use selectedTable
  useEffect(() => {
    const loadInitialItems = async () => {
      setIsLoadingItems(true);
      setFetchItemsError(null);
      try {
        const dbListItems = await fetchInitialDatabaseItems(selectedTable);
        setItems(dbListItems);
        console.log(`Initial summarized database items loaded from ${selectedTable} into component state.`);
      } catch (error) {
        console.error(`Error fetching initial summarized database items from ${selectedTable} on client:`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred while fetching items.';
        setFetchItemsError(errorMessage);
        setItems([]);
      } finally {
        setIsLoadingItems(false);
      }
    };
    loadInitialItems();
  }, [selectedTable]); // Add selectedTable as a dependency

  console.log("process.env.NEXT_PUBLIC_OPENAI_API_KEY", process.env.NEXT_PUBLIC_OPENAI_API_KEY);
  console.log("process.env.NEXT_PUBLIC_OPENAI_API_ENDPOINT", process.env.NEXT_PUBLIC_OPENAI_API_ENDPOINT);
  const openaiClient = useMemo(() => new AzureOpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY!,
    endpoint: process.env.NEXT_PUBLIC_OPENAI_API_ENDPOINT!,
    dangerouslyAllowBrowser: true,
    apiVersion: "2024-02-01",
  }), []);

  const generateEmbeddings = useCallback(async (text: string) => {
    try {
      console.log(`[${new Date().toISOString()}] generateEmbeddings starting`, text);
      const response = await openaiClient.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      console.log(`[${new Date().toISOString()}] generateEmbeddings response`, response);
      if (response.data && response.data.length > 0 && response.data[0].embedding) {
        return response.data[0].embedding;
      }
      console.warn('No embeddings returned from API or embedding data is missing.');
      return null;
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings. See console for details.');
    }
  }, [openaiClient]);

  // Helper function to calculate Cosine Similarity
  const calculateCosineSimilarity = (vecA: number[], vecB: number[]): number | null => {
    // console.log("vecA", vecA);
    // console.log("vecB", vecB);
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      console.warn('Cosine similarity: Invalid input vectors.', { vecA_len: vecA?.length, vecB_len: vecB?.length });
      return null;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      console.warn('Cosine similarity: Zero magnitude vector.');
      return 0; // Or null, depending on how you want to handle this edge case
    }

    return dotProduct / (magnitudeA * magnitudeB);
  };

  const getChatCompletion = useCallback(async (
    chatHistory: Message[],
    currentUserQuery: string,
    contextForQuery: string
  ) => {
    try {
      const apiMessages: any[] = [
        { 
          role: "system", 
          content: "You are a helpful assistant specializing in Apache Airflow documentation and code examples. Your task is to provide detailed, accurate answers based on the context provided. When answering:\n\n1. Thoroughly analyze all information in the context and the user's query\n2. Provide comprehensive explanations with specific code examples when relevant\n3. Quote and highlight relevant portions of the context using markdown formatting (e.g., ```python, **bold**, etc.)\n4. If version-specific information is available, clearly indicate which Airflow version the answer applies to\n5. If the context doesn't contain enough information to fully answer the query, acknowledge this limitation\n6. Structure your responses with clear headings and sections when appropriate\n\nYour goal is to be as helpful and informative as possible, leveraging all available context to provide the most accurate and useful response."
        },
        ...chatHistory.map((msg) => ({ role: msg.sender === 'user' ? 'user' : 'assistant', content: msg.text })),
        { role: "user", content: `Context from knowledge base:\n---\n${contextForQuery}\n---\n\nUser Query: ${currentUserQuery}` },
      ];

      console.log("apiMessages", apiMessages);
      
      const completion = await openaiClient.chat.completions.create({ model: "gpt-4.1", messages: apiMessages });
      if (completion.choices && completion.choices.length > 0 && completion.choices[0].message && completion.choices[0].message.content) {
        return completion.choices[0].message.content;
      }
      return "Sorry, I could not generate a valid response at this time.";
    } catch (error) {
      console.error('Error getting chat completion:', error);
      throw new Error('Failed to get chat completion. See console for details.');
    }
  }, [openaiClient]);

  const handleSelectItem = async (item: DatabaseListItem) => {
    console.log(`Item clicked: ${item.name} (ID: ${item.id}) from ${selectedTable}`);
    setIsLoadingSelectedItemDetails(true);
    setFetchSelectedItemError(null);
    setSelectedItem(null); // Clear previous selection details immediately
    try {
      const fullItemDetails = await fetchFullDatabaseItemById(item.id, selectedTable);
      if (fullItemDetails) {
        setSelectedItem(fullItemDetails);
        console.log('Full item details loaded:', fullItemDetails);
      } else {
        setFetchSelectedItemError(`Could not load details for item ID: ${item.id} from ${selectedTable}.`);
        console.warn(`No full details returned for item ID: ${item.id} from ${selectedTable}`);
      }
    } catch (error) {
      console.error(`Error fetching full item details from ${selectedTable}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setFetchSelectedItemError(errorMessage);
    } finally {
      setIsLoadingSelectedItemDetails(false);
    }
  };

  const handleBackToList = () => {
    setSelectedItem(null);
    setFetchSelectedItemError(null); // Clear any error from detail view
  };

  const handleResetChat = () => {
    setMessages([]);
    console.log('Chat history reset.');
  };

  // Add state for version filtering toggle
  const VERSION_FILTER_STORAGE_KEY = 'useVersionFilter';
  const [useVersionFilter, setUseVersionFilter] = useState(true); // Default to true without checking localStorage initially

  // Update useVersionFilter from localStorage only on the client side
  useEffect(() => {
    const stored = localStorage.getItem(VERSION_FILTER_STORAGE_KEY);
    if (stored !== null) {
      setUseVersionFilter(stored === 'true');
    }
  }, []);

  // Store version filter preference in localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VERSION_FILTER_STORAGE_KEY, useVersionFilter.toString());
    }
  }, [useVersionFilter]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    console.log(`[${new Date().toISOString()}] handleSendMessage starting`, userInput);
    const currentInput = userInput;
    const newUserMessage: Message = { id: Date.now().toString(), text: currentInput, sender: 'user' };
    const messagesBeforeThisTurn = messages;
    setMessages((prevMessages) => [...prevMessages, newUserMessage]);
    setUserInput('');
    setIsLoadingAiResponse(true);
    try {
      console.log(`[${new Date().toISOString()}] handleSendMessage generating embeddings`);
      const userInputEmbedding = await generateEmbeddings(currentInput);
      console.log(`[${new Date().toISOString()}] handleSendMessage embeddings generated`);
      let foundRawItems: DatabaseItem[] = [];
      let suggestionsWithScores: DisplaySuggestionItem[] = [];
      let vectorContextData = `Regarding your query about "${currentInput.substring(0, 30)}${currentInput.length > 30 ? "..." : ""}", `;

      if (userInputEmbedding) {
        try {
          // Update to include selectedTable in the semantic search and respect version filter toggle
          const searchVersion = useVersionFilter ? version : null;
          console.log(`[${new Date().toISOString()}] handleSendMessage performing semantic search with version filter: ${useVersionFilter ? 'ON' : 'OFF'}, version: ${searchVersion || 'any'}`);
          
          foundRawItems = await performSemanticSearch({ 
            embedding: userInputEmbedding, 
            queryText: currentInput, 
            limit: 10, 
            version: searchVersion, // Only apply version filter if toggle is on
            tableName: selectedTable 
          });
          
          console.log(`[${new Date().toISOString()}] handleSendMessage semantic search results`, foundRawItems);
          
          if (foundRawItems.length > 0) {
            suggestionsWithScores = foundRawItems.map(item => {
              let score: number | undefined = undefined;
              let dbEmbeddingForSimilarity: number[] | null = null;

              if (item.embedding) { // Check if embedding exists on the item
                if (typeof item.embedding === 'string') {
                  try {
                    const parsed = JSON.parse(item.embedding);
                    if (Array.isArray(parsed) && (parsed.length === 0 || typeof parsed[0] === 'number')) {
                      dbEmbeddingForSimilarity = parsed as number[];
                    } else {
                      console.warn(`Parsed item.embedding for item ID ${item.id} is not a valid number array:`, parsed);
                    }
                  } catch (e) {
                    console.error(`Failed to parse item.embedding string for item ID ${item.id}:`, item.embedding, e);
                  }
                } else if (Array.isArray(item.embedding) && (item.embedding.length === 0 || typeof item.embedding[0] === 'number')) {
                  // Ensure all elements are numbers if array is not empty
                  if (item.embedding.length > 0 && !item.embedding.every(el => typeof el === 'number')) {
                    console.warn(`item.embedding for item ID ${item.id} is an array, but not all elements are numbers:`, item.embedding);
                  } else {
                    dbEmbeddingForSimilarity = item.embedding as number[]; // Already an array of numbers
                  }
                } else {
                  console.warn(`item.embedding for item ID ${item.id} has an unexpected type/structure:`, typeof item.embedding, item.embedding);
                }
              }

              if (userInputEmbedding && dbEmbeddingForSimilarity) {
                const similarity = calculateCosineSimilarity(userInputEmbedding, dbEmbeddingForSimilarity);
                console.log(`Similarity score for "${item.name}" (ID: ${item.id}): ${similarity}`);
                if (similarity !== null && !isNaN(similarity)) {
                  score = similarity;
                } else if (similarity === null) {
                  console.warn(`Cosine similarity returned null for item ID ${item.id}. This might be due to vector length mismatch or invalid vectors reported by calculateCosineSimilarity.`);
                } else if (isNaN(similarity)) {
                  console.warn(`Cosine similarity returned NaN for item ID ${item.id}. This could indicate issues with non-numeric data within the embedding vectors after parsing.`);
                }
              } else {
                if (!userInputEmbedding && item.embedding) console.log(`Skipping similarity calculation for "${item.name}" (ID: ${item.id}): User input embedding not available.`);
                if (userInputEmbedding && !dbEmbeddingForSimilarity && item.embedding) console.log(`Skipping similarity calculation for "${item.name}" (ID: ${item.id}): Database embedding could not be processed into a valid number array.`);
                if (!item.embedding)  console.log(`Skipping similarity calculation for "${item.name}" (ID: ${item.id}): Database item has no embedding.`);
              }
              return { ...item, similarityScore: score };
            })
            // Sort by similarity score descending, if available
            .sort((a, b) => (b.similarityScore ?? -1) - (a.similarityScore ?? -1))
            .slice(0, 5); // Take top 5 for context data

            // Build detailed context data with actual content from the items
            vectorContextData = `Here are the most relevant items from the database for your query:\n\n`;
            
            suggestionsWithScores.forEach((item, index) => {
              const similarityPercentage = item.similarityScore !== undefined 
                ? `${(item.similarityScore * 100).toFixed(1)}%` 
                : 'N/A';
              
              // Include file name/item name, similarity score, and content
              vectorContextData += `--- ITEM ${index + 1} ---\n`;
              vectorContextData += `File: ${item.name || 'Unnamed'}\n`;
              vectorContextData += `Similarity: ${similarityPercentage}\n`;
              
              // Include version info if available
              if (item.version) {
                vectorContextData += `Version: ${item.version}\n`;
              }
              
              // Include the actual content
              if (item.content) {
                vectorContextData += `Content:\n${item.content}\n\n`;
              } else {
                vectorContextData += `No content available for this item.\n\n`;
              }
            });
            
            // Only show top 3 as UI suggestions
            const uiSuggestions = suggestionsWithScores.slice(0, 5);
          } else {
            vectorContextData += `I couldn't find specific items in our database.`;
          }
        } catch (searchError) {
          console.error('Error during semantic search or processing results:', searchError);
          vectorContextData += `Error searching database.`;
        }
      } else {
        vectorContextData += `Could not process query for database search (embedding generation failed).`;
      }

      console.log(`[${new Date().toISOString()}] handleSendMessage getting chat completion`);
      const aiResponseText = await getChatCompletion(messagesBeforeThisTurn, currentInput, vectorContextData);
      console.log(`[${new Date().toISOString()}] handleSendMessage ai response text`, aiResponseText);
      const aiResponseMessage: Message = {
        id: Date.now().toString() + '-ai',
        text: aiResponseText || "Sorry, error in AI response.",
        sender: 'ai',
        suggestions: suggestionsWithScores.length > 0 ? suggestionsWithScores.slice(0, 5) : undefined,
      };
      setMessages((prevMessages) => [...prevMessages, aiResponseMessage]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error.';
      setMessages((prev) => [...prev, { id: Date.now().toString() + '-error', text: `Error: ${errorMsg}`, sender: 'ai' }]);
    } finally {
      setIsLoadingAiResponse(false);
    }
  };

  // Helper to format date in a fixed, timezone-agnostic way (ISO 8601, always UTC)
  const formatDate = (dateInput?: Date | string | null) => {
    if (!dateInput) return 'N/A';
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return 'Invalid Date';
      // Format as YYYY-MM-DD HH:mm UTC
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Left Pane */}
      <div className="w-1/3 border-r border-gray-300 dark:border-gray-700 p-4 overflow-y-auto">
        {!selectedItem && !isLoadingSelectedItemDetails ? (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Database Items</h2>
              
              {/* Add the table selection dropdown */}
              {databaseTables && (
                <select
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  className="p-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm"
                >
                  <option value={databaseTables.CODE_EXAMPLES}>Code Examples</option>
                  <option value={databaseTables.AIRFLOW_CODE_EMBEDDINGS}>Airflow Code</option>
                </select>
              )}
            </div>
            
            {isLoadingItems && <p>Loading database items...</p>}
            {fetchItemsError && <p className="text-red-500">Error: {fetchItemsError}</p>}
            {!isLoadingItems && !fetchItemsError && items.length === 0 && <p>No items found in the database.</p>}
            {!isLoadingItems && !fetchItemsError && items.length > 0 && (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => handleSelectItem(item)} // Pass DatabaseListItem
                    className="p-3 bg-white dark:bg-gray-800 rounded-md shadow hover:shadow-lg cursor-pointer transition-shadow"
                  >
                    <div className="flex justify-between items-center">
                    <span className="font-medium">{item.id}</span>.
                      <span
                        className="font-medium"
                        style={{
                          display: 'block',
                          textAlign: 'left',
                          marginLeft: '10px',
                          width: '100%',
                        }}
                      >
                        {item.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(item.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <button
              onClick={handleBackToList}
              className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              &larr; Back to List
            </button>
            {isLoadingSelectedItemDetails && <p>Loading details...</p>}
            {fetchSelectedItemError && <p className="text-red-500">Error loading details: {fetchSelectedItemError}</p>}
            {selectedItem && !isLoadingSelectedItemDetails && (
              <>
                <h2 className="text-xl font-semibold mb-2 break-all">{selectedItem.name}</h2>
                <div className="p-3 bg-white dark:bg-gray-800 rounded-md shadow space-y-3">
                  {Object.entries(selectedItem).map(([key, value]) => {
                    // Skip embedding for direct display due to its size
                    if (key === 'embedding') return null;
                    // Format date values
                    const displayValue = (key === 'created_at') 
                                         ? formatDate(value as Date)
                                         : (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : (value === null || value === undefined) ? 'N/A' : '[Object]');
                    return (
                      <div key={key} className="py-1 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}:</h3>
                        <p className="text-sm whitespace-pre-wrap break-words">{displayValue}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right Pane (Chat Area) */}
      <div className="w-2/3 flex flex-col p-4">

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">AI Chat</h2>
          <div className="flex items-center gap-3">
            {/* Version filter toggle */}
            <div className="flex items-center">
              <span className="text-xs mr-2" title="When enabled, search results are filtered to match the selected Airflow version">Filter by version</span>
              <label className="relative inline-flex items-center cursor-pointer" title={isClient && !useVersionFilter ? "Show results from all versions" : "Filter search results by version"}>
                <input 
                  type="checkbox" 
                  checked={useVersionFilter} 
                  onChange={() => setUseVersionFilter(!useVersionFilter)} 
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
              {/* Only render this span on the client side */}
              {isClient && !useVersionFilter && (
                <span className="ml-2 text-xs text-yellow-500 dark:text-yellow-400">
                  All versions
                </span>
              )}
            </div>
            <div className="relative" style={{ maxWidth: 200 }}>
              {/* <label className="block text-xs font-medium mb-1">Airflow Version</label> */}
              <div className="relative">
                <input
                  type="text"
                  value={versionInput}
                  onChange={e => {
                    setVersionInput(e.target.value);
                    setShowVersionDropdown(true);
                  }}
                  onFocus={() => useVersionFilter && setShowVersionDropdown(true)}
                  onBlur={() => setTimeout(() => setShowVersionDropdown(false), 100)} // Delay to allow click
                  placeholder={useVersionFilter ? "Type or select version" : "Version filter disabled"}
                  className={`w-full p-2 border rounded ${
                    useVersionFilter 
                      ? "border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800" 
                      : "border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                  disabled={!useVersionFilter}
                  autoComplete="off"
                />
                {/* Only render this div on the client side */}
                {isClient && !useVersionFilter && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded opacity-80">
                      <span className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Not filtering
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {/* Only render dropdown on the client side */}
              {isClient && useVersionFilter && showVersionDropdown && filteredVersions.length > 0 && (
                <ul className="absolute z-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded w-full mt-1 max-h-40 overflow-y-auto shadow">
                  {filteredVersions.map(v => (
                    <li
                      key={v}
                      onMouseDown={() => {
                        setVersionInput(v);
                        setVersion(v); // update your main version state
                        setShowVersionDropdown(false);
                      }}
                      className="px-3 py-1 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900"
                    >
                      {v}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              onClick={handleResetChat}
              className="h-full w-full border border-red-500 text-red-600 bg-transparent rounded hover:bg-red-50 dark:hover:bg-red-900 transition-colors text-xs font-medium flex items-center justify-center"
              title="Clear chat history"
              style={{ minHeight: 0, minWidth: 0, margin: 0, height: 40, width: 100 }}
            >
              Reset Chat
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto mb-4 p-3 bg-white dark:bg-gray-800 rounded-md shadow space-y-2">
          {messages.map((msg, index, arr) => {
            const currentMessageIsUser = msg.sender === 'user';
            const nextMessage = arr[index + 1];
            const showSuggestionsAfterThisUserMessage =
              currentMessageIsUser &&
              nextMessage?.sender === 'ai' &&
              nextMessage?.suggestions &&
              nextMessage.suggestions.length > 0;

            return (
              <React.Fragment key={msg.id}>
                {/* 1. The message bubble itself (user or AI) */}
                <div className={`flex w-full ${currentMessageIsUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`p-3 rounded-lg max-w-xl shadow ${
                      currentMessageIsUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                  </div>
                </div>

                {/* 2. Suggestions (if applicable after a user message) */}
                {showSuggestionsAfterThisUserMessage && nextMessage && nextMessage.suggestions && (
                  <div className="flex w-full justify-end"> {/* Aligns suggestion block to the right */}
                    <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-xl"> {/* Suggestions container */}
                      {nextMessage.suggestions.map((item: DisplaySuggestionItem) => ( 
                        <button
                          key={item.id}
                          onClick={() => {
                            if (selectedItem?.id !== item.id) {
                                handleSelectItem({id: item.id, name: item.name!, created_at: item.created_at });
                            } else {
                                // Item already selected, maybe just scroll to it or no-op
                            }
                          }}
                          className="px-2 py-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-indigo-100 text-xs rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-600 transition-colors shadow-sm"
                          title={`${item.name}${item.similarityScore !== undefined ? ` (Similarity: ${(item.similarityScore * 100).toFixed(1)}%)` : ''}`}
                        >
                          {item.name!.length > 20 ? item.name!.slice(0, 20) + '...' : item.name}
                          {item.similarityScore !== undefined && (
                            <span className="ml-1 text-xs opacity-75">({(item.similarityScore * 100).toFixed(0)}%)</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
          {isLoadingAiResponse && (
            <div className="flex justify-start w-full">
              <div className="p-3 rounded-lg max-w-xl shadow bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                  <p className="text-sm italic">AI is thinking...</p>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-grow p-3 border border-gray-300 dark:border-gray-700 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-gray-800"
          />
          <button
            type="submit"
            disabled={isLoadingAiResponse}
            className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
