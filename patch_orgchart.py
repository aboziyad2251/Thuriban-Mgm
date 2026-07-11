import re
import sys

def main():
    try:
        with open("backend/public/index.html", "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print("Failed to read", e)
        sys.exit(1)

    # 1. Replace the initial pan and reset view
    content = content.replace("const [pan, setPan] = useState({ x: 100, y: 50 });", "const [pan, setPan] = useState({ x: 0, y: 20 });")
    content = content.replace("setPan({ x: 100, y: 50 });", "setPan({ x: 0, y: 20 });")

    # 2. Inject handleTouch handlers after handleMouseUp
    touch_handlers = """  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.org-node-card') || e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    // On mobile, native scrolling can interfere with panning
    // By preventing default here on non-card interactions, we prevent swipe-to-refresh or page scroll when panning the chart
    if (e.cancelable) e.preventDefault();
    setPan({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };"""

    content = content.replace("  const handleMouseUp = () => {\n    setIsDragging(false);\n  };", touch_handlers)

    # 3. Add touch events to viewport
    viewport_old = """          <div 
            className="org-chart-viewport" 
            ref={viewportRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >"""
    viewport_new = """          <div 
            className="org-chart-viewport" 
            ref={viewportRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onWheel={handleWheel}
            style={{ touchAction: 'none' }}
          >"""
    content = content.replace(viewport_old, viewport_new)

    # Also make sure the css for .org-chart-viewport has `touch-action: none;` just in case inline style isn't enough
    css_old = """    .org-chart-viewport {
      position: relative;
      width: 100%;
      height: calc(100vh - 200px);"""
    css_new = """    .org-chart-viewport {
      position: relative;
      width: 100%;
      height: calc(100vh - 200px);
      touch-action: none; /* Prevents native scroll on touch */"""
    content = content.replace(css_old, css_new)

    with open("backend/public/index.html", "w", encoding="utf-8") as f:
        f.write(content)

    print("Patch applied for mobile org chart.")

if __name__ == "__main__":
    main()
