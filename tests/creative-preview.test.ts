import { expect, it } from 'vitest';
import { creativePreview } from '../lib/ui/creative-preview';

it('prefers the full image and retains a thumbnail fallback with supplied copy',()=>{
  const preview=creativePreview({image_url:'https://cdn.example/full.jpg',thumbnail_url:'https://cdn.example/small.jpg',object_story_spec:{link_data:{message:'Fresh lunch',name:'Order today',picture:'https://cdn.example/full.jpg'}}});
  expect(preview.images).toEqual(['https://cdn.example/full.jpg','https://cdn.example/small.jpg']);expect(preview.format).toBe('Image');expect(preview.copy).toBe('Fresh lunch');expect(preview.headline).toBe('Order today');
});
it('handles an ad’s nested video creative without claiming the thumbnail is a playable video',()=>{
  const preview=creativePreview({id:'ad',creative:{id:'creative',thumbnail_url:'https://cdn.example/video.jpg',object_story_spec:{video_data:{video_id:'123',message:'Video copy',title:'Video headline'}}}});
  expect(preview.format).toBe('Video');expect(preview.images).toEqual(['https://cdn.example/video.jpg']);expect(preview.copy).toBe('Video copy');expect(preview).not.toHaveProperty('video');
});
it('uses carousel and dynamic-creative metadata when direct fields are absent',()=>{
  expect(creativePreview({object_story_spec:{link_data:{child_attachments:[{picture:'https://cdn.example/card.jpg'}]}}})).toMatchObject({format:'Carousel',images:['https://cdn.example/card.jpg']});
  expect(creativePreview({asset_feed_spec:{images:[{url:'https://cdn.example/variant.jpg'}],bodies:[{text:'Variant copy'}],titles:[{text:'Variant title'}]}})).toMatchObject({format:'Image',copy:'Variant copy',headline:'Variant title'});
});
it('rejects credential-bearing or unsafe media URLs rather than exposing them in an image',()=>{
  for(const value of ['javascript:alert(1)','http://cdn.example/ad.jpg','https://user:password@cdn.example/ad.jpg','https://cdn.example/ad.jpg?access_token=secret','https://cdn.example/ad.jpg?ACCESS_TOKEN=secret'])expect(creativePreview({image_url:value}).images).toEqual([]);
});
it('keeps unavailable and malformed media empty instead of inventing a preview',()=>{
  for(const value of [null,[],{creative:null},{object_story_spec:{link_data:null}},{asset_feed_spec:{images:'missing'}}])expect(creativePreview(value)).toMatchObject({images:[],copy:'',headline:''});
});
