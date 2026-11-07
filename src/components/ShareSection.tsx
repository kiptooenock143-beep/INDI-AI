
import { useState } from 'react';
import { Share2, Smartphone, Globe, Users, Link, Send, Facebook, Twitter, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface App {
  id: string;
  name: string;
  icon: React.ReactNode;
  category: string;
}

interface OnlineContent {
  id: string;
  title: string;
  platform: string;
  type: string;
}

const ShareSection = () => {
  const [apps] = useState<App[]>([
    { id: '1', name: 'WhatsApp', icon: <Send className="w-5 h-5" />, category: 'messaging' },
    { id: '2', name: 'Facebook', icon: <Facebook className="w-5 h-5" />, category: 'social' },
    { id: '3', name: 'Twitter', icon: <Twitter className="w-5 h-5" />, category: 'social' },
    { id: '4', name: 'Instagram', icon: <Instagram className="w-5 h-5" />, category: 'social' },
    { id: '5', name: 'Email', icon: <Send className="w-5 h-5" />, category: 'messaging' },
    { id: '6', name: 'Messages', icon: <Send className="w-5 h-5" />, category: 'messaging' },
  ]);

  const [onlineContent] = useState<OnlineContent[]>([
    { id: '1', title: 'Latest News Article', platform: 'News', type: 'article' },
    { id: '2', title: 'Funny Meme Collection', platform: 'Reddit', type: 'image' },
    { id: '3', title: 'Tutorial Video', platform: 'YouTube', type: 'video' },
    { id: '4', title: 'Recipe Blog Post', platform: 'Blog', type: 'article' },
    { id: '5', title: 'Product Review', platform: 'Amazon', type: 'review' },
  ]);

  return (
    <div className="h-96">
      <div className="p-4 border-b bg-gradient-to-r from-pink-50 to-purple-50">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Share2 className="w-5 h-5 text-pink-600" />
          Share Hub
        </h2>
        <p className="text-sm text-gray-600 mt-1">Access apps and share content</p>
      </div>

      <div className="p-4">
        <Tabs defaultValue="apps" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="apps" className="text-xs">
              <Smartphone className="w-4 h-4 mr-2" />
              Apps
            </TabsTrigger>
            <TabsTrigger value="online" className="text-xs">
              <Globe className="w-4 h-4 mr-2" />
              Online
            </TabsTrigger>
          </TabsList>

          <TabsContent value="apps" className="mt-4">
            <ScrollArea className="h-64">
              <div className="grid grid-cols-2 gap-2">
                {apps.map((app) => (
                  <Card key={app.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white">
                          {app.icon}
                        </div>
                        <span className="text-xs font-medium text-gray-700">{app.name}</span>
                        <span className="text-xs text-gray-500 capitalize">{app.category}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="online" className="mt-4">
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {onlineContent.map((content) => (
                  <Card key={content.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="truncate">{content.title}</span>
                        <Button variant="ghost" size="sm">
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Globe className="w-3 h-3" />
                        <span>{content.platform}</span>
                        <span>•</span>
                        <span className="capitalize">{content.type}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {/* Quick Share Actions */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" className="text-xs">
            <Link className="w-3 h-3 mr-1" />
            Copy Link
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            Share
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Send className="w-3 h-3 mr-1" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShareSection;
