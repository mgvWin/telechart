import { Telechart } from '../Telechart'
import { AbstractChartDrawer } from '../Drawer/AbstractChartDrawer'
import { Telecolumn } from '../Telecolumn'
import { Telecanvas } from '../Telecanvas'
import { Telemation } from '../Telemation'

export abstract class AbstractTelemap {
    protected config!: { rangeBackground: string, rangeFill: string, shadow: string }
    protected rangeProperty: { from: Telemation, to: Telemation }|null = null
    protected topPadding = 0
    protected bottomPadding = 0
    protected cacheTeelcanvas: Telecanvas
    protected telecanvasCached = false
    protected columns: Telecolumn[] = []
    protected drawers: AbstractChartDrawer[] = []
    private themeProperty: 'light'|'dark' = 'light'

    constructor(protected readonly telechart: Telechart, public height = 44) {
        this.theme = telechart.theme
        this.topPadding = this.telecanvas.height - height
        this.initHTML()
        this.cacheTeelcanvas = new Telecanvas(null, this.height - 2, this.telecanvas.width)
        this.telecanvas.addResizeListener(() => {
            this.cacheTeelcanvas.width = this.telecanvas.width
            this.telecanvasCached = false
        })
    }

    get telecanvas() {
        return this.telechart.telecanvas
    }

    get firstDrawer() {
        return this.drawers.length ? this.drawers[0] : undefined
    }

    public addColumn(column: Telecolumn) {
        this.columns.push(column)
    }

    public removeColumn(column: Telecolumn) {
        this.columns.splice(this.columns.indexOf(column), 1)
        this.drawers.forEach(d => d.removeColumn(column))
    }

    get theme() {
        return this.themeProperty
    }

    set theme(value) {
        this.themeProperty = value
        if (value === 'dark') {
            this.config = {
                ...this.config,
                rangeBackground: '#56626D',
                rangeFill: '#242f3e',
                shadow: '#30425999',
            }
        } else {
            this.config = {
                ...this.config,
                rangeBackground: '#C0D1E1',
                rangeFill: '#fff',
                shadow: '#E2EEF999',
            }
        }
    }

    set range(value: { from: number, to: number }|null) {
        const current = this.range
        this.rangeProperty = {
            from: Telemation.create(current ? current.from : 0, value!.from, current ? 50 : 0),
            to: Telemation.create(current ? current.to : 0, value!.to, current ? 50 : 0),
        }
        if (!this.firstDrawer) {
            return
        }
        this.columns.forEach((c, index) => {
            const from = this.firstDrawer!.borders.minX.to + (this.firstDrawer!.borders.maxX.to - this.firstDrawer!.borders.minX.to) * value!.from
            const to = this.firstDrawer!.borders.minX.to + (this.firstDrawer!.borders.maxX.to - this.firstDrawer!.borders.minX.to) * value!.to
            if (!index) {
                this.telechart.setRangeText(this.telechart.getDateString(from) + ' - ' + this.telechart.getDateString(to))
            }
            c.setCurrentRange(from, to)
        })
        this.telechart.teledisplay.recalcBorders(current ? 200 : 0)
    }

    get range(): { from: number, to: number }|null {
        return this.rangeProperty ? { from: this.rangeProperty!.from.value, to: this.rangeProperty!.to.value } : null
    }

    public draw() {
        const c = this.telecanvas
        const left = this.range!.from * this.telecanvas.width
        const width = (this.range!.to - this.range!.from) * this.telecanvas.width

        if (this.columns.reduce((r, col) => !col.opacity.finished || r, false) || !this.firstDrawer!.borders.maxY.finished) {
            this.telecanvasCached = false
        }
        if (!this.telecanvasCached) {
            this.cacheTeelcanvas.clear()
            this.drawColumns()
            this.cacheTeelcanvas.drawTelecanvas(this.telecanvas, 0, -this.topPadding - 1)
            this.telecanvasCached = true
            c.clear()
        }
        c.save()
        c.setRoundedClippingRect(0, this.topPadding + 1, c.width, this.height - 2, 6)
        c.drawTelecanvas(this.cacheTeelcanvas, 0, this.topPadding + 1)

        c.rect(0, this.topPadding + 1, left + 6, this.height - 2, this.config.shadow) // Shadow to left
        c.rect(left + width - 6, this.topPadding + 1, this.telecanvas.width - left - width + 6, this.height - 2, this.config.shadow) // Shadow to right

        c.restore()

        c.roundedRect(left, this.topPadding, 10, this.height, 6, this.config.rangeBackground) // Left gripper corners
        c.rect(left + 5, this.topPadding, 5, this.height, this.config.rangeBackground) // Left gripper rect
        c.roundedRect(left + 4, this.topPadding + 15, 2, 12, 2, this.config.rangeFill) // Left gripper strip

        c.roundedRect(left + width - 10, this.topPadding, 10, this.height, 6, this.config.rangeBackground) // Right gripper corners
        c.rect(left + width - 10, this.topPadding, 5, this.height, this.config.rangeBackground) // Right gripper rect
        c.roundedRect(left + width - 6, this.topPadding + 15, 2, 12, 2, this.config.rangeFill) // Right gripper strip

        c.line([left + 10 - 1, this.topPadding], [left + width - 10 + 1, this.topPadding], this.config.rangeBackground)
        c.line([left + 10 - 1, this.topPadding + this.height - 1], [left + width - 10 + 1, this.topPadding + this.height - 1], this.config.rangeBackground)

        if (!this.rangeProperty!.to.finished) {
            this.telechart.redraw()
        }
    }

    public recalcBorders(duration: number = 0) {
        this.drawers.forEach(d => d.recalcBorders(duration))
        this.telechart.redraw()
    }

    protected abstract drawColumns(): void

    protected initHTML() {
        let currentPos = { left: 0, top: 0 }
        let startRange: { from: number, to: number }|null = null
        let startPos: { left: number, top: number }|null = null
        let moveType: 'all'|'from'|'to'|null = null
        let yInArea = false
        const mousemove = (x: number, y: number) => {
            currentPos = { left: x, top: y }
            yInArea = y >= this.topPadding && y < this.topPadding + this.height

            if (!startPos || !startRange) {
                if (yInArea) {
                    const left = this.range!.from * this.telecanvas.width
                    const width = (this.range!.to - this.range!.from) * this.telecanvas.width
                    if (x >= left - 5 && x <= left + 20) {
                        moveType = 'from'
                        this.telecanvas.cursor = 'ew-resize'
                    } else if (x >= left + width - 15 && x < left + width + 5) {
                        moveType = 'to'
                        this.telecanvas.cursor = 'ew-resize'
                    } else if (x >= left && x < left + width) {
                        moveType = 'all'
                        this.telecanvas.cursor = 'move'
                    } else {
                        moveType = null
                        this.telecanvas.cursor = 'default'
                    }
                } else {
                    this.telecanvas.cursor = 'default'
                }
                return
            }
            this.columns.forEach(c => c.setCurrentX(null))
            const diff = (currentPos.left - startPos!.left) / this.telecanvas.width
            let newRangeFrom = startRange!.from
            let newRangeTo = startRange!.to
            if (moveType === 'all' || moveType === 'from') {
                newRangeFrom += diff
            }
            if (moveType === 'all' || moveType === 'to') {
                newRangeTo += diff
            }
            if (newRangeFrom < 0) {
                if (moveType === 'all' || moveType === 'to') {
                    newRangeTo = newRangeTo - newRangeFrom
                }
                newRangeFrom = 0
            }
            if (newRangeTo > 1) {
                if (moveType === 'all' || moveType === 'from') {
                    newRangeFrom = newRangeFrom - (newRangeTo - 1)
                }
                newRangeTo = 1
            }
            if (newRangeTo - newRangeFrom < 0.1) {
                if (moveType === 'to') {
                    newRangeTo = newRangeFrom + 0.1
                } else {
                    newRangeFrom = newRangeTo - 0.1
                }
            }
            this.range = { from: newRangeFrom, to: newRangeTo }
        }
        const mousedown = (x: number, y: number) => {
            if (moveType) {
                startPos = { ...currentPos }
                startRange = { ...this.range! }
            }
        }
        const mouseup = () => {
            moveType = null
            startPos = null
            startRange = null
        }
        this.telecanvas.addMouseMoveListener(mousemove)
        this.telecanvas.addMouseDownListener((x, y) => {
            mousemove(x, y)
            mousedown(x, y)
        })
        this.telecanvas.addMouseUpListener(mouseup)
    }

}
