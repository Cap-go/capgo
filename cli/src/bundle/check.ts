import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

function searchInFile(filePath: string, searchString: string) {
  const content = readFileSync(filePath, 'utf8')
  return content.includes(searchString)
}

export function searchInDirectory(dirPath: string, searchString: string) {
  const files = readdirSync(dirPath)
  for (const file of files) {
    const filePath = join(dirPath, file)
    const stats = statSync(filePath)

    if (stats.isDirectory()) {
      if (searchInDirectory(filePath, searchString))
        return true
    }
    else if (stats.isFile() && extname(filePath) === '.js') {
      if (searchInFile(filePath, searchString))
        return true
    }
  }

  return false
}

export function checkIndexPosition(dirPath: string): boolean {
  const files = readdirSync(dirPath)
  const index = files.indexOf('index.html')
  if (index > -1)
    return true

  return false
}
