const fs = require('fs')
const path = require('path')

const defaultOption = {
  includes: [path.resolve(process.cwd(), 'src')],
  output: {
    path: path.resolve(process.cwd()),
    filename: 'dependency.json'
  },
  pathType: 'relative',
  circularMode: 'circular',
  assetsFormatter: (dependency) => JSON.stringify(dependency)
}

class FileDependencyResolvePlugin {
  constructor({
    includes,
    output: { path: outputPath, filename: outputFilename },
    pathType,
    circularMode,
    assetsFormatter
  } = {}) {
    this.title = 'FileDependencyResolvePlugin'
    this.cwd = process.cwd()
    this.dependencyArray = [] // 依赖数组
    this.dependencyGraph = null // 依赖树的根节点
    this.circularPathArray = null // 循环依赖的路径数组
    this.cache = new Map()
    // TODO:支持其他类型文件的依赖解析，如.css
    this.fileTypes = ['.js']
    this.includes = includes || defaultOption.includes
    this.outputPath = outputPath || defaultOption.output.path
    this.outputFilename = outputFilename || defaultOption.output.filename
    this.pathType = pathType || defaultOption.pathType
    this.circularMode = circularMode || defaultOption.circularMode
    this.assetsFormatter = assetsFormatter || defaultOption.assetsFormatter
  }

  apply(compiler) {
    compiler.hooks.normalModuleFactory.tap(this.title, (factory) => {
      factory.hooks.afterResolve.tapAsync(this.title, (data, callback) => {
        const { resourceResolveData } = data
        const filePath = resourceResolveData.path
        const issuerPath = resourceResolveData.context.issuer || filePath

        if (
          this.validatePath(filePath, issuerPath) &&
          this.validateFileType(filePath, issuerPath)
        ) {
          const processedFilePath = this.processPathType(filePath)
          const processedIssuerPath = this.processPathType(issuerPath)

          if (!this.cache.has(processedFilePath)) {
            this.cache.set(processedFilePath, {
              path: processedFilePath,
              deps: []
            })
          }

          this.dependencyArray.push({
            path: processedFilePath,
            issuer: processedIssuerPath
          })
        }
        callback(null, data)
      })
    })

    compiler.hooks.done.tapAsync(this.title, (stats, callback) => {
      this.buildDependencyTree()
      this.circularPathArray = this.getCircularPath()
      this.emitAssest()
      callback(null)
    })
  }

  // 验证文件路径是否合法
  validatePath(filePath, issuerPath) {
    return (
      this.includes.some((includePath) => filePath.includes(includePath)) &&
      this.includes.some((includePath) => issuerPath.includes(includePath))
    )
  }

  // 验证文件类型是否合法
  validateFileType(filePath, issuerPath) {
    return (
      this.fileTypes.includes(path.extname(filePath)) &&
      this.fileTypes.includes(path.extname(issuerPath))
    )
  }

  // 根据用于配置选择输出内容的文件路径类型
  processPathType(filePath) {
    const { pathType } = this
    if (typeof pathType === 'function') {
      return pathType(filePath)
    }
    if (pathType === 'absolute') {
      return filePath
    }
    if (pathType === 'relative') {
      return path.relative(this.cwd, filePath)
    }
    return path.relative(this.cwd, filePath)
  }

  // 构建依赖树
  buildDependencyTree() {
    this.dependencyArray.forEach((dep) => {
      const { path: filePath, issuer: issuerPath } = dep
      if (filePath === issuerPath) {
        // 入口文件
        this.dependencyGraph = this.cache.get(filePath)
      } else {
        const issuer = this.cache.get(issuerPath)
        issuer.deps.push(this.cache.get(filePath))
      }
    })
  }

  // 检验循环依赖
  getCircularPath() {
    const backtrack = (node, path) => {
      if (!node) {
        return
      }
      if (path.includes(node.path)) {
        res = this.processCircularPath(path, node.path)
        return
      }
      path.push(node.path)
      for (let dep of node.deps) {
        backtrack(dep, path)
      }
      path.pop()
    }

    let res = ''
    backtrack(this.dependencyGraph, [])
    return res
  }

  // 根据用户输出，处理循环依赖数组的格式
  processCircularPath(path, circular) {
    const mode = this.circularMode
    path.push(circular)
    const idx = path.indexOf(circular)
    switch (mode) {
      case 'full':
        return [...path]
      case 'pre':
        return path.slice(idx - 1)
      case 'circular':
        return path.slice(idx)
      default:
        return path.slice(idx)
    }
  }

  // 输出资源
  emitAssest() {
    if (!fs.existsSync(this.outputPath)) {
      fs.mkdirSync(this.outputPath)
    }

    const content = this.assetsFormatter(
      Array.isArray(this.circularPathArray)
        ? this.circularPathArray
        : this.dependencyGraph
    )

    fs.writeFile(
      path.resolve(this.outputPath, this.outputFilename),
      content,
      (err) => {
        if (err) {
          console.log(err)
        } else {
          console.log(
            '文件依赖解析完成',
            path.resolve(this.outputPath, this.outputFilename)
          )
        }
      }
    )
  }
}

module.exports = FileDependencyResolvePlugin
