import { useState } from 'react'
import './SaveQueryModal.css'

function SaveQueryModal({ onSave, onUpdate, onClose, currentQueryId, currentQueryName, currentQuery }) {
  const [queryName, setQueryName] = useState(currentQueryName || '')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!queryName.trim()) {
      setError('Query name is required')
      return
    }

    const success = currentQueryId
      ? await onUpdate(queryName.trim())
      : await onSave(queryName.trim())

    if (success) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{currentQueryId ? 'Update Query' : 'Save Query'}</h2>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="query-name">Query Name</label>
              <input
                id="query-name"
                type="text"
                value={queryName}
                onChange={(e) => {
                  setQueryName(e.target.value)
                  setError('')
                }}
                placeholder="Enter a name for this query"
                autoFocus
              />
              {error && <div className="error-message">{error}</div>}
            </div>

            <div className="query-preview">
              <h3>Current Query</h3>
              <div className="preview-item">
                <strong>Index:</strong> {currentQuery.index}
              </div>
              <div className="preview-item">
                <strong>Search:</strong> {currentQuery.search_query || '*'}
              </div>
              <div className="preview-item">
                <strong>Filters:</strong> {currentQuery.filters.length} active
              </div>
              {currentQuery.time_range && (
                <div className="preview-item">
                  <strong>Time Range:</strong> {
                    currentQuery.time_range.quickSelect ||
                    `${new Date(currentQuery.time_range.from * 1000).toLocaleString()} - ${currentQuery.time_range.to ? new Date(currentQuery.time_range.to * 1000).toLocaleString() : 'Now'}`
                  }
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {currentQueryId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SaveQueryModal
