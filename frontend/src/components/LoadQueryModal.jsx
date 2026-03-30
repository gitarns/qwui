import { useState } from 'react'
import { format } from 'date-fns'
import './LoadQueryModal.css'

function LoadQueryModal({ savedQueries, onLoad, onDelete, onClose, currentQueryId }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)

  const filteredQueries = savedQueries.filter(query =>
    query.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    query.query.index.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDelete = async (id) => {
    if (deleteConfirmId === id) {
      const success = await onDelete(id)
      if (success) {
        setDeleteConfirmId(null)
      }
    } else {
      setDeleteConfirmId(id)
      setTimeout(() => setDeleteConfirmId(null), 3000)
    }
  }

  const handleLoad = (query) => {
    onLoad(query)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content load-query-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Load Saved Query</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search queries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {filteredQueries.length === 0 ? (
            <div className="empty-state">
              {savedQueries.length === 0
                ? 'No saved queries yet. Save your first query to get started!'
                : 'No queries match your search.'}
            </div>
          ) : (
            <div className="queries-list">
              {filteredQueries.map((query) => {
                const isActive = query.id === currentQueryId
                const isDeleteConfirm = deleteConfirmId === query.id

                return (
                  <div
                    key={query.id}
                    className={`query-item ${isActive ? 'active' : ''}`}
                  >
                    <div className="query-info" onClick={() => handleLoad(query)}>
                      <div className="query-name">
                        {query.name}
                        {isActive && <span className="active-badge">Active</span>}
                      </div>
                      <div className="query-details">
                        <span className="query-index">Index: {query.query.index}</span>
                        <span className="query-filters">
                          {query.query.filters.length} filter{query.query.filters.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="query-dates">
                        <span>Created: {format(new Date(query.created_at * 1000), 'MMM dd, yyyy HH:mm')}</span>
                        {query.modified_at !== query.created_at && (
                          <span>Modified: {format(new Date(query.modified_at * 1000), 'MMM dd, yyyy HH:mm')}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className={`delete-btn ${isDeleteConfirm ? 'confirm' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(query.id)
                      }}
                      title={isDeleteConfirm ? 'Click again to confirm' : 'Delete query'}
                    >
                      {isDeleteConfirm ? 'Confirm?' : '🗑'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="queries-count">
            {filteredQueries.length} {filteredQueries.length === 1 ? 'query' : 'queries'}
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoadQueryModal
