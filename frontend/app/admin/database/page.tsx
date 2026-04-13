"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Search, Download, Eye, EyeOff,
} from "lucide-react";
import {
  Input, Btn, Card, PageWrapper, SectionHeader, LoadingScreen, EmptyState, useToast,
} from "../_components/shared";
import { adminApi } from "../_components/api";

interface Table {
  name: string;
  row_count: number;
}

interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface TableData {
  columns: ColumnSchema[];
  rows: any[];
  total: number;
}

export default function DatabaseBrowserPage() {
  const { toast } = useToast();
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [schema, setSchema] = useState<ColumnSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [skip, setSkip] = useState(0);
  const [limit] = useState(50);
  const [showSchema, setShowSchema] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.listDbTables();
      setTables(res.tables || []);
      toast("Tables chargées", "success");
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadTableData = useCallback(
    async (tableName: string) => {
      try {
        setDataLoading(true);
        setSkip(0);

        // Load schema
        const schemaRes = await adminApi.getTableSchema(tableName);
        setSchema(schemaRes.schema || []);

        // Load data
        const dataRes = await adminApi.browseTable(tableName, { skip: 0, limit });
        setTableData(dataRes);

        // Show all columns by default
        const allColumns = new Set((schemaRes.schema || []).map((c: ColumnSchema) => c.name));
        setVisibleColumns(allColumns);

        toast("Données chargées", "success");
      } catch (err: any) {
        toast(`Erreur: ${err.message}`, "error");
      } finally {
        setDataLoading(false);
      }
    },
    [limit, toast]
  );

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (selectedTable) {
      loadTableData(selectedTable);
    }
  }, [selectedTable, loadTableData]);

  const handleLoadMore = async () => {
    if (!selectedTable || !tableData) return;
    try {
      setDataLoading(true);
      const dataRes = await adminApi.browseTable(selectedTable, {
        skip: skip + limit,
        limit,
      });
      setTableData({
        ...tableData,
        rows: [...(tableData?.rows || []), ...dataRes.rows],
      });
      setSkip(skip + limit);
    } catch (err: any) {
      toast(`Erreur: ${err.message}`, "error");
    } finally {
      setDataLoading(false);
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "string" && value.length > 100) {
      return value.substring(0, 100) + "...";
    }
    return String(value);
  };

  const currentPage = Math.floor(skip / limit) + 1;
  const pages = tableData ? Math.ceil(tableData.total / limit) : 0;

  return (
    <PageWrapper>
      <SectionHeader
        title="Navigateur de Base de Données"
        description="Explorez les tables et les données"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar: Tables list */}
        <div className="lg:col-span-1">
          <Card className="p-4 sticky top-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            <h3 className="text-sm font-semibold text-text-primary mb-4">
              Tables ({tables.length})
            </h3>

            {loading ? (
              <div className="text-xs text-text-muted text-center py-4">
                Chargement...
              </div>
            ) : tables.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-4">
                Aucune table
              </div>
            ) : (
              <div className="space-y-1">
                {tables.map((table) => (
                  <button
                    key={table.name}
                    onClick={() => setSelectedTable(table.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all
                      ${
                        selectedTable === table.name
                          ? "bg-accent/20 text-accent border border-accent/30"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-hover border border-border-subtle"
                      }`}
                  >
                    <div className="font-mono">{table.name}</div>
                    <div className="text-[10px] text-text-muted">
                      {table.row_count.toLocaleString("fr-FR")} lignes
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Main area: Table data */}
        <div className="lg:col-span-3">
          {!selectedTable ? (
            <EmptyState
              icon={Search}
              title="Sélectionnez une table"
              description="Cliquez sur une table dans la liste pour explorer ses données"
            />
          ) : dataLoading && !tableData ? (
            <LoadingScreen />
          ) : tableData ? (
            <>
              {/* Schema toggle */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">
                  {selectedTable}
                </h3>
                <Btn
                  variant="default"
                  onClick={() => setShowSchema(!showSchema)}
                  icon={showSchema ? EyeOff : Eye}
                  small
                >
                  {showSchema ? "Masquer" : "Schéma"}
                </Btn>
              </div>

              {/* Schema view */}
              {showSchema && (
                <Card className="p-4 mb-6">
                  <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">
                    Schéma
                  </h4>
                  <div className="space-y-2">
                    {schema.map((col) => (
                      <div key={col.name} className="text-xs">
                        <span className="font-mono text-accent">{col.name}</span>
                        {" — "}
                        <span className="text-text-secondary">{col.type}</span>
                        {col.nullable && (
                          <span className="text-text-muted"> (nullable)</span>
                        )}
                        {col.default && (
                          <span className="text-text-muted">
                            {" "}
                            (default: {col.default})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Data table */}
              {tableData.rows.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="Aucune donnée"
                  description="Cette table est vide"
                />
              ) : isMobile ? (
                // Mobile: cards
                <div className="space-y-3">
                  {tableData.rows.map((row, idx) => (
                    <Card key={idx} className="p-4">
                      {Object.entries(row).map(([key, value]) => (
                        visibleColumns.has(key) && (
                          <div key={key} className="mb-2">
                            <span className="text-[10px] font-semibold text-text-muted uppercase">
                              {key}
                            </span>
                            <p className="text-xs text-text-secondary break-all">
                              {formatValue(value)}
                            </p>
                          </div>
                        )
                      ))}
                    </Card>
                  ))}
                </div>
              ) : (
                // Desktop: table
                <Card className="overflow-x-auto mb-6">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        {schema
                          .filter((col) => visibleColumns.has(col.name))
                          .map((col) => (
                            <th
                              key={col.name}
                              className="px-4 py-3 text-left text-[10px] font-semibold text-text-muted uppercase"
                            >
                              {col.name}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-border-subtle hover:bg-bg-hover transition-colors"
                        >
                          {schema
                            .filter((col) => visibleColumns.has(col.name))
                            .map((col) => (
                              <td key={col.name} className="px-4 py-3">
                                <span className="text-text-secondary break-all">
                                  {formatValue(row[col.name])}
                                </span>
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {/* Pagination */}
              {tableData.total > limit && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-xs text-text-muted">
                    Affichage: {(skip + 1)} à{" "}
                    {Math.min(skip + tableData.rows.length, tableData.total)} sur{" "}
                    {tableData.total.toLocaleString("fr-FR")}
                  </div>
                  {skip + limit < tableData.total && (
                    <Btn
                      variant="primary"
                      onClick={handleLoadMore}
                      disabled={dataLoading}
                      loading={dataLoading}
                      small
                    >
                      Charger plus
                    </Btn>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </PageWrapper>
  );
}
