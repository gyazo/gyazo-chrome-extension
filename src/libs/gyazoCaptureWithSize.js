import thenChrome from 'then-chrome'
import browserInfo from 'bowser'
import {trimImage, appendImageToCanvas} from './canvasUtils'
import postToGyazo from './postToGyazo'
import waitForDelay from './waitForDelay'

export default (request, sender, sendResponse) => {
  // XXX: Firefox WebExtension returns real size image
  if (browserInfo.firefox) request.data.s = 1
  const baseCanvas = document.createElement('canvas')
  baseCanvas.height = request.data.h * request.data.z * request.data.s
  baseCanvas.width = request.data.w * request.data.z * request.data.s
  const capture = async (scrollHeight, lastImageBottom, lastImageData) => {
    const imagePositionTop = lastImageBottom || scrollHeight * request.data.z * request.data.s
    const offsetTop = request.data.y - request.data.positionY
    if (scrollHeight === 0 && offsetTop >= 0 && offsetTop + request.data.h <= request.data.innerHeight) {
      // Capture in window (not require scroll)
      const captureData = await thenChrome.tabs.captureVisibleTab(null, {format: 'png'})
      if (lastImageData === captureData) {
        // retry
        return capture(scrollHeight, lastImageBottom, captureData)
      }
      const trimedImageCanvas = await trimImage({
        imageData: captureData,
        scale: request.data.s,
        zoom: request.data.z,
        startX: request.data.x - request.data.positionX,
        startY: offsetTop,
        width: request.data.w,
        height: Math.min(request.data.innerHeight, request.data.h - scrollHeight)
      })
      await appendImageToCanvas({
        canvas: baseCanvas,
        imageSrc: trimedImageCanvas.toDataURL(),
        pageHeight: request.data.h,
        imageHeight: Math.min(request.data.innerHeight, request.data.h - scrollHeight),
        width: request.data.w,
        top: 0,
        scale: request.data.s,
        zoom: request.data.z
      })
      scrollHeight += request.data.innerHeight
      capture(scrollHeight)
      return
    }
    if (scrollHeight >= request.data.h) {
      chrome.tabs.executeScript(request.tab.id, {
        code: 'window.scrollTo(' + request.data.positionX + ', ' + request.data.positionY + ' )'
      })
      postToGyazo(request.tab.id, {
        imageData: baseCanvas.toDataURL(),
        title: request.data.t,
        url: request.data.u,
        width: request.data.w,
        height: request.data.h,
        scale: request.data.s,
        desc: request.data.desc
      })
      return sendResponse()
    }
    await thenChrome.tabs.executeScript(request.tab.id, {
      code: 'window.scrollTo(' + request.data.positionX + ', ' + (scrollHeight + request.data.y) + ' )'
    })
    await thenChrome.tabs.sendMessage(request.tab.id, {
      target: 'content',
      action: 'changeFixedElementToAbsolute',
      scrollTo: {x: request.data.positionX, y: scrollHeight + request.data.y}
    })
    const data = await thenChrome.tabs.captureVisibleTab(null, {format: 'png'})
    if (lastImageData === data) {
      // retry
      return capture(scrollHeight, lastImageBottom, data)
    }
    const trimedImageCanvas = await trimImage({
      imageData: data,
      scale: request.data.s,
      zoom: request.data.z,
      startX: request.data.x - request.data.positionX,
      startY: 0,
      width: request.data.w,
      height: Math.min(request.data.innerHeight, request.data.h - scrollHeight)
    })
    const _lastImageBottom = await appendImageToCanvas({
      canvas: baseCanvas,
      imageSrc: trimedImageCanvas.toDataURL(),
      pageHeight: request.data.h,
      imageHeight: Math.min(request.data.innerHeight, request.data.h - scrollHeight),
      width: request.data.w,
      top: imagePositionTop,
      scale: request.data.s,
      zoom: request.data.z
    })
    scrollHeight += request.data.innerHeight
    waitForDelay(function () {
      capture(scrollHeight, _lastImageBottom, data)
    })
  }
  capture(0)
}