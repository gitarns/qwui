import { useEffect, useState } from 'react'

const VERSION_CHECK_INTERVAL = 60000 // Check every 60 seconds

export function useVersionCheck() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(null)

  useEffect(() => {
    let currentVersionData = null

    const checkVersion = async () => {
      try {
        // Fetch version with cache busting
        const response = await fetch(`/version.json?t=${Date.now()}`)
        if (!response.ok) return

        const versionData = await response.json()

        // On first check, just store the version
        if (currentVersionData === null) {
          currentVersionData = versionData
          setCurrentVersion(versionData.timestamp)
          return
        }

        // On subsequent checks, compare versions
        if (versionData.timestamp && versionData.timestamp !== currentVersionData.timestamp) {
          console.log('New version available. Current:', currentVersionData.timestamp, 'New:', versionData.timestamp)
          setNewVersionAvailable(true)
        }
      } catch (err) {
        console.debug('Version check failed:', err)
      }
    }

    // Initial check
    checkVersion()

    // Set up periodic checks
    const intervalId = setInterval(checkVersion, VERSION_CHECK_INTERVAL)

    return () => clearInterval(intervalId)
  }, [])

  const reloadPage = () => {
    window.location.reload()
  }

  return { newVersionAvailable, reloadPage }
}
